import "server-only";
import { today } from "@/lib/dates";
import type { createClient } from "@/lib/supabase/server";
import { taskStates, type TaskSchedule } from "@/lib/tasks";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Today's state of each task. Only the completions for each task's latest due
 * date are fetched, so this stays small however long the school has run.
 */
export async function loadTaskStates<T extends TaskSchedule & { id: string }>(supabase: Supabase, tasks: T[]) {
  const date = today();
  const { data: school } = await supabase.from("schools").select("term_start_months").single();
  const terms: number[] = school?.term_start_months ?? [1, 5, 9];
  const pending = taskStates(tasks, [], date, terms);
  if (!pending.length) return [];
  const { data: completions } = await supabase
    .from("task_completions")
    .select("id, template_id, due_date, done_by, note")
    .in("template_id", pending.map((s) => s.task.id))
    .in("due_date", [...new Set(pending.map((s) => s.dueDate))]);
  return taskStates(tasks, completions ?? [], date, terms);
}
