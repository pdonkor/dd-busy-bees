"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { firstIssue, type ActionState } from "@/lib/action-state";
import { classRow, classSchema } from "@/lib/class-schema";
import { requireRole } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { normaliseGhanaPhone } from "@/lib/phone";
import { sendSms } from "@/lib/sms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/tokens";

// Every action re-checks the caller's role here, and the database checks again
// through row-level security, because the queries below run as the logged-in user.

const text = (max = 200) => z.string().trim().max(max);
const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const uuid = z.string().uuid();
const optionalUuid = z
  .string()
  .transform((v) => v || null)
  .pipe(z.string().uuid().nullable());
const phone = z.string().transform((v, ctx) => {
  const normalised = normaliseGhanaPhone(v);
  if (!normalised) {
    ctx.addIssue({ code: "custom", message: "Enter a Ghana mobile number, for example 024 123 4567." });
    return z.NEVER;
  }
  return normalised;
});

function form(formData: FormData) {
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

const FAILED = "That didn't save. Please try again.";

// Classes -----------------------------------------------------------------------

export async function createClass(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = classSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("classes").insert({ ...classRow(parsed.data), school_id: user.schoolId });
  if (error) return { error: FAILED };
  revalidatePath("/owner/classes");
  return { success: `Added ${parsed.data.name}.` };
}

export async function updateClass(classId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("owner", "admin");
  const parsed = classSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("classes").update(classRow(parsed.data)).eq("id", uuid.parse(classId));
  if (error) return { error: FAILED };
  revalidatePath("/owner/classes");
  return { success: "Saved." };
}

export async function setClassArchived(classId: string, archived: boolean) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase.from("classes").update({ archived }).eq("id", uuid.parse(classId));
  revalidatePath("/owner/classes");
}

// Curriculum --------------------------------------------------------------------

export async function addArea(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = z
    .object({ name: text(80).min(1, "Give the area a name."), description: optionalText(500) })
    .safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { count } = await supabase.from("curriculum_areas").select("id", { count: "exact", head: true });
  const { error } = await supabase
    .from("curriculum_areas")
    .insert({ ...parsed.data, school_id: user.schoolId, position: count ?? 0 });
  if (error) return { error: FAILED };
  revalidatePath("/owner/curriculum");
  return { success: `Added ${parsed.data.name}.` };
}

export async function deleteArea(areaId: string) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase.from("curriculum_areas").delete().eq("id", uuid.parse(areaId));
  revalidatePath("/owner/curriculum");
}

export async function addMaterial(areaId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = z.object({ name: text(120).min(1, "Give the material a name.") }).safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { count } = await supabase
    .from("materials")
    .select("id", { count: "exact", head: true })
    .eq("area_id", uuid.parse(areaId));
  const { error } = await supabase
    .from("materials")
    .insert({ name: parsed.data.name, area_id: areaId, school_id: user.schoolId, position: count ?? 0 });
  if (error) return { error: FAILED };
  revalidatePath("/owner/curriculum");
  return { success: `Added ${parsed.data.name}.` };
}

export async function deleteMaterial(materialId: string) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase.from("materials").delete().eq("id", uuid.parse(materialId));
  revalidatePath("/owner/curriculum");
}

// Invites -------------------------------------------------------------------------

async function createInvite(
  user: { id: string; schoolId: string },
  invite: {
    role: "admin" | "teacher" | "parent";
    full_name: string;
    phone?: string | null;
    email?: string | null;
    class_id?: string | null;
    child_id?: string | null;
    relationship?: string | null;
  },
): Promise<ActionState> {
  const token = generateToken();
  const supabase = await createClient();
  const { error } = await supabase
    .from("invites")
    .insert({ ...invite, school_id: user.schoolId, token_hash: hashToken(token), created_by: user.id });
  if (error) return { error: "Couldn't create the invite. Please try again." };

  const link = `${serverEnv().APP_URL}/invite/${token}`;
  if (invite.phone) {
    try {
      await sendSms(invite.phone, `You've been invited to DD Busy Bees. Open this link to join: ${link}`);
    } catch {
      return { success: "Invite created, but the SMS didn't send. Share this link with them instead:", link };
    }
    return { success: `Invite sent by SMS to ${invite.phone}. You can also share this link (valid 7 days):`, link };
  }
  return { success: "Invite created. Send this link to them (valid 7 days, works once):", link };
}

const staffInviteSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("teacher"),
    full_name: text(120).min(1, "Enter their name."),
    phone,
    class_id: optionalUuid,
  }),
  z.object({
    role: z.literal("admin"),
    full_name: text(120).min(1, "Enter their name."),
    email: z.string().trim().toLowerCase().email("Office accounts need an email address."),
  }),
]);

export async function inviteStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = staffInviteSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (parsed.data.role === "admin" && user.role !== "owner") {
    return { error: "Only the owner can invite office (admin) accounts." };
  }
  const result = await createInvite(user, parsed.data);
  revalidatePath("/owner/staff");
  return result;
}

const parentInviteSchema = z.object({
  full_name: text(120).min(1, "Enter the parent's name."),
  phone,
  relationship: text(40).min(1, "Say how they're related, for example mother."),
});

export async function inviteParent(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = parentInviteSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await createInvite(user, { ...parsed.data, role: "parent", child_id: uuid.parse(childId) });
  revalidatePath(`/owner/children/${childId}`);
  return result;
}

export async function revokeInvite(inviteId: string) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase.from("invites").update({ revoked_at: new Date().toISOString() }).eq("id", uuid.parse(inviteId));
  revalidatePath("/owner/staff");
  revalidatePath("/owner/children", "layout");
}

// Staff -----------------------------------------------------------------------------

export async function assignClass(teacherId: string, formData: FormData) {
  const user = await requireRole("owner", "admin");
  const classId = uuid.safeParse(formData.get("class_id"));
  if (!classId.success) return;
  const supabase = await createClient();
  await supabase
    .from("staff_assignments")
    .upsert({ teacher_id: uuid.parse(teacherId), class_id: classId.data, school_id: user.schoolId });
  revalidatePath("/owner/staff");
}

export async function unassignClass(teacherId: string, classId: string) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase
    .from("staff_assignments")
    .delete()
    .eq("teacher_id", uuid.parse(teacherId))
    .eq("class_id", uuid.parse(classId));
  revalidatePath("/owner/staff");
}

/**
 * Switching someone off blocks them in the database straight away and bans their
 * login, which also stops their existing sessions from refreshing.
 */
export async function setUserActive(profileId: string, active: boolean): Promise<void> {
  await requireRole("owner", "admin");
  const id = uuid.parse(profileId);
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").update({ active }).eq("id", id).select("id");
  if (!data?.length) return; // not permitted (RLS or the role guard refused)

  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  revalidatePath("/owner/staff");
  revalidatePath("/owner/children", "layout");
}

// Children --------------------------------------------------------------------------

const childSchema = z.object({
  first_name: text(80).min(1, "Enter the child's first name."),
  last_name: text(80).min(1, "Enter the child's surname."),
  date_of_birth: z.string().date("Enter the date of birth."),
  class_id: optionalUuid,
  start_date: z
    .string()
    .transform((v) => v || null)
    .pipe(z.string().date().nullable()),
  allergies: optionalText(),
  medical_notes: optionalText(),
  photo_consent: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  outings_consent: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export async function createChild(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = childSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("children")
    .insert({ ...parsed.data, school_id: user.schoolId })
    .select("id")
    .single();
  if (error) return { error: FAILED };
  revalidatePath("/owner/children");
  redirect(`/owner/children/${data.id}`);
}

export async function updateChild(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("owner", "admin");
  const parsed = childSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("children").update(parsed.data).eq("id", uuid.parse(childId));
  if (error) return { error: FAILED };
  revalidatePath(`/owner/children/${childId}`);
  revalidatePath("/owner/children");
  return { success: "Saved." };
}

export async function setChildStatus(childId: string, status: "active" | "left") {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase
    .from("children")
    .update({ status, left_date: status === "left" ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", uuid.parse(childId));
  revalidatePath(`/owner/children/${childId}`);
  revalidatePath("/owner/children");
}

export async function removeGuardian(childId: string, parentId: string) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase.from("guardians").delete().eq("child_id", uuid.parse(childId)).eq("parent_id", uuid.parse(parentId));
  revalidatePath(`/owner/children/${childId}`);
}

const pickupSchema = z.object({
  full_name: text(120).min(1, "Enter their name."),
  phone: z.string().transform((v) => (v ? normaliseGhanaPhone(v) : null)),
  relationship: optionalText(40),
});

export async function addPickup(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const raw = form(formData);
  if (raw.phone && !normaliseGhanaPhone(raw.phone)) {
    return { error: "Enter a Ghana mobile number, for example 024 123 4567, or leave it blank." };
  }
  const parsed = pickupSchema.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("authorised_pickups")
    .insert({ ...parsed.data, child_id: uuid.parse(childId), school_id: user.schoolId });
  if (error) return { error: FAILED };
  revalidatePath(`/owner/children/${childId}`);
  return { success: `Added ${parsed.data.full_name}.` };
}

export async function removePickup(childId: string, pickupId: string) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase.from("authorised_pickups").delete().eq("id", uuid.parse(pickupId));
  revalidatePath(`/owner/children/${childId}`);
}
