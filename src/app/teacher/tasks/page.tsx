import { SubmitButton } from "@/components/form-status";
import { Card, Empty, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDay, today } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { loadTaskStates } from "@/lib/task-status";
import { describeSchedule } from "@/lib/tasks";
import { tickTask, untickTask } from "../actions";

export default async function MyTasks() {
  const user = await requireRole("teacher");
  const supabase = await createClient();
  const date = today();
  const { data: templates } = await supabase
    .from("task_templates")
    .select("id, name, instructions, frequency, weekday, day_of_month, month")
    .eq("active", true)
    .or(`assignee_id.is.null,assignee_id.eq.${user.id}`)
    .order("name");
  const states = await loadTaskStates(supabase, templates ?? []);
  const order = { overdue: 0, due: 1, done: 2 };
  states.sort((a, b) => order[a.state] - order[b.state]);

  return (
    <>
      <PageHeader title="My tasks" subtitle={`Upkeep checks for ${formatDay(date)}. Tick each one when it's done.`} />
      {!states.length && <Empty>No tasks for you right now.</Empty>}
      <div className="space-y-3">
        {states.map(({ task, dueDate, state, completion }) => (
          <Card
            key={task.id}
            className={state === "overdue" ? "border-red-200" : state === "done" ? "opacity-70" : ""}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {state === "done" && "✓ "}
                  {task.name}
                </p>
                <p className="text-xs text-stone-500">
                  {describeSchedule(task)}
                  {state === "overdue" && <span className="ml-1 text-red-700">· missed on {formatDay(dueDate)}</span>}
                </p>
                {task.instructions && <p className="mt-1 text-sm text-stone-700">{task.instructions}</p>}
                {completion?.note && <p className="mt-1 text-sm text-stone-600">Note: {completion.note}</p>}
              </div>
              {state === "done" ? (
                completion?.done_by === user.id && (
                  <form action={untickTask.bind(null, completion.id)}>
                    <button className="min-h-10 px-2 text-sm text-stone-600 underline">Undo</button>
                  </form>
                )
              ) : (
                <form action={tickTask.bind(null, task.id, dueDate)} className="flex flex-wrap items-center gap-2">
                  <Input name="note" placeholder="Problem to report? (optional)" maxLength={1000} className="w-auto min-w-56" />
                  <SubmitButton pendingText="Ticking…">Done</SubmitButton>
                </form>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
