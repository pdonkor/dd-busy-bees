"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstIssue, type ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GHANA_STARTER_TASKS } from "@/lib/task-presets";
import { taskSchema } from "@/lib/task-schema";

const uuid = z.string().uuid();
const FAILED = "That didn't save. Please try again.";

function form(formData: FormData) {
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = taskSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("task_templates").insert({ ...parsed.data, school_id: user.schoolId });
  if (error) return { error: FAILED };
  revalidatePath("/owner/tasks");
  return { success: `Added ${parsed.data.name}.` };
}

export async function updateTask(taskId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("owner", "admin");
  const parsed = taskSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("task_templates").update(parsed.data).eq("id", uuid.parse(taskId));
  if (error) return { error: FAILED };
  revalidatePath("/owner/tasks");
  return { success: "Saved." };
}

export async function setTaskActive(taskId: string, active: boolean) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase.from("task_templates").update({ active }).eq("id", uuid.parse(taskId));
  revalidatePath("/owner/tasks");
}

export async function deleteTask(taskId: string) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase.from("task_templates").delete().eq("id", uuid.parse(taskId));
  revalidatePath("/owner/tasks");
}

/** Adds the Ghana starter checklist, skipping any task whose name is already in use. */
export async function addStarterTasks(): Promise<void> {
  const user = await requireRole("owner", "admin");
  const supabase = await createClient();
  const { data: existing } = await supabase.from("task_templates").select("name");
  const taken = new Set((existing ?? []).map((t) => t.name.toLowerCase()));
  const rows = GHANA_STARTER_TASKS.filter((t) => !taken.has(t.name.toLowerCase())).map((t) => ({
    name: t.name,
    instructions: t.instructions ?? null,
    frequency: t.frequency,
    weekday: t.weekday ?? null,
    day_of_month: t.day_of_month ?? null,
    month: t.month ?? null,
    school_id: user.schoolId,
  }));
  if (rows.length) await supabase.from("task_templates").insert(rows);
  revalidatePath("/owner/tasks");
}

/** Term start months drive "each term" tasks (and, later, termly fees). Owner only. */
export async function setTermMonths(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  if (user.role !== "owner") return { error: "Only the owner can change the term dates." };
  const months = formData
    .getAll("months")
    .map(Number)
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
    .sort((a, b) => a - b);
  if (!months.length) return { error: "Choose at least one month." };
  const supabase = await createClient();
  const { error } = await supabase.from("schools").update({ term_start_months: months }).eq("id", user.schoolId);
  if (error) return { error: FAILED };
  revalidatePath("/owner/tasks");
  return { success: "Saved." };
}
