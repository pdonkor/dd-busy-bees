"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstIssue, type ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { parseDate, today } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

// As with the owner actions, these run as the logged-in teacher, so row-level
// security limits them to children in the teacher's own classes.

const uuid = z.string().uuid();
const FAILED = "That didn't save. Please try again.";

// Attendance ----------------------------------------------------------------------

export async function checkIn(childId: string) {
  const user = await requireRole("teacher");
  const supabase = await createClient();
  // A unique (child, date) rule makes a second tap harmless.
  await supabase
    .from("attendance")
    .insert({ child_id: uuid.parse(childId), school_id: user.schoolId, checked_in_by: user.id });
  revalidatePath("/teacher");
}

const OTHER = "__other__";

export async function checkOut(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const id = uuid.parse(childId);
  const choice = String(formData.get("collected_by") ?? "");
  const other = String(formData.get("other_name") ?? "").trim().slice(0, 120);
  if (!choice) return { error: "Choose who is collecting the child." };
  if (choice === OTHER && !other) return { error: "Type the name of the person collecting the child." };

  const supabase = await createClient();
  // Check the name against the list on the server so the "not on the list" flag can't be skipped.
  const { data: options } = await supabase.rpc("pickup_options", { target_child: id });
  const listed = choice !== OTHER && (options ?? []).some((o: { name: string }) => o.name === choice);
  const name = choice === OTHER ? other : choice;

  const { error, count } = await supabase
    .from("attendance")
    .update(
      {
        checked_out_at: new Date().toISOString(),
        checked_out_by: user.id,
        collected_by: name,
        collected_by_unlisted: !listed,
      },
      { count: "exact" },
    )
    .eq("child_id", id)
    .eq("date", today())
    .is("checked_out_at", null);
  if (error || !count) return { error: FAILED };
  revalidatePath("/teacher");
  return {
    success: listed ? `Collected by ${name}.` : `Collected by ${name}. They aren't on the pick-up list, so the office has been told.`,
  };
}

// Activity logs -------------------------------------------------------------------

const logSchema = z
  .object({
    kind: z.enum(["activity", "meal", "nap", "toilet", "mood", "note"]),
    children: z.array(uuid).min(1, "Choose at least one child."),
    quick: z.string().trim().max(200).optional(),
    body: z.string().trim().max(2000).optional(),
    area_id: z.string().optional(),
    material_id: z.string().optional(),
    stage: z.enum(["presented", "practising", "mastered", ""]).optional(),
  })
  .transform((v) => {
    const isActivity = v.kind === "activity";
    const body = [v.quick, v.body].filter(Boolean).join(". ") || null;
    return {
      kind: v.kind,
      children: v.children,
      body,
      area_id: isActivity && v.area_id ? v.area_id : null,
      material_id: isActivity && v.material_id ? v.material_id : null,
      stage: isActivity && v.stage ? v.stage : null,
    };
  })
  .refine((v) => v.body || v.material_id || v.area_id, { message: "Add a note or choose what they did." })
  .refine((v) => [v.area_id, v.material_id].every((x) => x === null || uuid.safeParse(x).success), {
    message: "Please choose from the list.",
  });

export async function logActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const parsed = logSchema.safeParse({
    kind: formData.get("kind"),
    children: formData.getAll("children"),
    quick: formData.get("quick") ?? undefined,
    body: formData.get("body") ?? undefined,
    area_id: formData.get("area_id") ?? undefined,
    material_id: formData.get("material_id") ?? undefined,
    stage: formData.get("stage") ?? undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { children, ...log } = parsed.data;

  const supabase = await createClient();
  // Choose the id here so the children can be tagged without reading the log back.
  const logId = crypto.randomUUID();
  const { error } = await supabase
    .from("activity_logs")
    .insert({ ...log, id: logId, school_id: user.schoolId, logged_by: user.id });
  if (error) return { error: FAILED };
  const { error: tagError } = await supabase
    .from("activity_children")
    .insert(children.map((child_id) => ({ log_id: logId, child_id, school_id: user.schoolId })));
  if (tagError) {
    await supabase.from("activity_logs").delete().eq("id", logId);
    return { error: FAILED };
  }
  revalidatePath("/teacher/log");
  return { success: `Logged for ${children.length} ${children.length === 1 ? "child" : "children"}.` };
}

export async function deleteLog(logId: string) {
  await requireRole("teacher");
  const supabase = await createClient();
  await supabase.from("activity_logs").delete().eq("id", uuid.parse(logId));
  revalidatePath("/teacher/log");
}

// Maintenance tasks ---------------------------------------------------------------

export async function tickTask(templateId: string, dueDate: string, formData: FormData) {
  const user = await requireRole("teacher");
  const date = parseDate(dueDate);
  if (!date) return;
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;
  const supabase = await createClient();
  await supabase.from("task_completions").insert({
    template_id: uuid.parse(templateId),
    school_id: user.schoolId,
    due_date: date,
    done_by: user.id,
    note,
  });
  revalidatePath("/teacher/tasks");
}

export async function untickTask(completionId: string) {
  await requireRole("teacher");
  const supabase = await createClient();
  await supabase.from("task_completions").delete().eq("id", uuid.parse(completionId));
  revalidatePath("/teacher/tasks");
}
