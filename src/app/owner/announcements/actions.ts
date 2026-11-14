"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstIssue, type ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { sendBatch } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const optionalUuid = z
  .string()
  .transform((v) => v || null)
  .pipe(z.string().uuid().nullable());

const announcementSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(120),
  body: z.string().trim().min(1, "Write the announcement.").max(4000),
  class_id: optionalUuid,
  sms: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

/** Posts a notice to the whole school or one class, optionally with an SMS to each family. */
export async function postAnnouncement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = announcementSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { title, body, class_id, sms } = parsed.data;
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const { error } = await supabase
    .from("announcements")
    .insert({ id, school_id: user.schoolId, class_id, title, body, sent_sms: sms, created_by: user.id });
  if (error) return { error: "That didn't post. Please try again." };
  revalidatePath("/owner/announcements");

  if (!sms) return { success: "Posted. Parents see it in the app." };
  const admin = createAdminClient();
  let children = admin.from("children").select("id").eq("school_id", user.schoolId).eq("status", "active");
  if (class_id) children = children.eq("class_id", class_id);
  const { data: kids } = await children;
  const { data: guardians } = await admin
    .from("guardians")
    .select("parent_id, profiles!inner(phone, active)")
    .in("child_id", (kids ?? []).map((k) => k.id))
    .eq("profiles.active", true)
    .not("profiles.phone", "is", null);
  // One SMS per parent, even with several children.
  const parents = new Map((guardians ?? []).map((g) => [g.parent_id, (g.profiles as unknown as { phone: string }).phone]));
  const text = `DD Busy Bees: ${title}. ${body}`;
  const message = text.length > 300 ? `${text.slice(0, 240).trimEnd()}… More in the app: ${serverEnv().APP_URL}/parent/notices` : text;
  const result = await sendBatch(
    admin,
    [...parents].map(([parentId, phone]) => ({
      schoolId: user.schoolId,
      kind: "announcement",
      dedupeKey: `announcement:${id}:${parentId}`,
      to: phone,
      message,
      recipientId: parentId,
    })),
  );
  return { success: `Posted and sent by SMS to ${result.sent} ${result.sent === 1 ? "parent" : "parents"}${result.failed ? ` (${result.failed} failed)` : ""}.` };
}

export async function deleteAnnouncement(id: string) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase.from("announcements").delete().eq("id", z.string().uuid().parse(id));
  revalidatePath("/owner/announcements");
}

const eventSchema = z
  .object({
    title: z.string().trim().min(1, "Give the event a name.").max(120),
    kind: z.enum(["event", "closure", "meeting", "holiday"]),
    starts_on: z.string().date("Enter the date."),
    ends_on: z
      .string()
      .transform((v) => v || null)
      .pipe(z.string().date().nullable()),
    class_id: optionalUuid,
    notes: z
      .string()
      .trim()
      .max(1000)
      .transform((v) => v || null),
  })
  .transform((e) => ({ ...e, ends_on: e.ends_on ?? e.starts_on }))
  .refine((e) => e.ends_on >= e.starts_on, { message: "The end date must be on or after the start." });

export async function addEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = eventSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({ ...parsed.data, school_id: user.schoolId });
  if (error) return { error: "That didn't save. Please try again." };
  revalidatePath("/owner/calendar");
  return { success: `Added ${parsed.data.title} to the calendar.` };
}

export async function deleteEvent(id: string) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", z.string().uuid().parse(id));
  revalidatePath("/owner/calendar");
}
