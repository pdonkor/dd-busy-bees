"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { createInvite } from "@/lib/invites";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const STAGES = ["enquiry", "tour_booked", "offered", "enrolled", "waitlisted", "declined"] as const;

export async function updateEnquiry(enquiryId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("owner", "admin");
  const parsed = z
    .object({
      stage: z.enum(STAGES),
      notes: z
        .string()
        .trim()
        .max(2000)
        .transform((v) => v || null),
      tour_at: z
        .string()
        .transform((v) => (v ? new Date(`${v}:00Z`).toISOString() : null))
        .nullable(),
    })
    .safeParse({ stage: formData.get("stage"), notes: formData.get("notes") ?? "", tour_at: formData.get("tour_at") ?? "" });
  if (!parsed.success) return { error: "Please check the form." };
  if (parsed.data.stage === "enrolled") return { error: "Use the Enrol button so the child and parent are set up." };
  const supabase = await createClient();
  const { error } = await supabase.from("enquiries").update(parsed.data).eq("id", uuid.parse(enquiryId)).neq("stage", "enrolled");
  if (error) return { error: "That didn't save. Please try again." };
  revalidatePath("/owner/enquiries");
  return { success: "Saved." };
}

/**
 * Turns an enquiry into an enrolled child, and texts the parent an invite link. When
 * they join they see their child and fill in the rest of the enrolment pack
 * (medical notes, emergency contacts, pick-up people, consents).
 */
export async function enrolFromEnquiry(enquiryId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const classId = z
    .string()
    .transform((v) => v || null)
    .pipe(uuid.nullable())
    .safeParse(formData.get("class_id") ?? "");
  if (!classId.success) return { error: "Choose a class from the list." };
  const supabase = await createClient();
  const { data: e } = await supabase.from("enquiries").select("*").eq("id", uuid.parse(enquiryId)).single();
  if (!e) return { error: "Enquiry not found." };
  if (e.child_id) return { error: "This child is already enrolled." };

  const { data: child, error } = await supabase
    .from("children")
    .insert({
      school_id: user.schoolId,
      first_name: e.child_first_name,
      last_name: e.child_last_name,
      date_of_birth: e.child_dob,
      start_date: e.start_date,
      class_id: classId.data,
    })
    .select("id")
    .single();
  if (error || !child) return { error: "Couldn't create the child. Please try again." };
  await supabase.from("enquiries").update({ stage: "enrolled", child_id: child.id }).eq("id", e.id);

  const invite = await createInvite(user, {
    role: "parent",
    full_name: e.parent_name,
    phone: e.phone,
    child_id: child.id,
    relationship: e.relationship || "parent",
  });
  revalidatePath("/owner/enquiries");
  revalidatePath("/owner/children");
  if (invite?.error) return { error: `${e.child_first_name} is enrolled, but the parent invite failed. Invite them from the child's page.` };
  redirect(`/owner/children/${child.id}`);
}
