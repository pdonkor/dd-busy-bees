import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { addDays, formatDay, today } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { loadTaskStates } from "@/lib/task-status";
import { MONTHS, describeSchedule } from "@/lib/tasks";
import { addStarterTasks, createTask, deleteTask, setTaskActive, setTermMonths, updateTask } from "./actions";
import { TaskFields } from "./task-fields";

const STATE_BADGE = {
  due: "bg-amber-100 text-amber-900",
  overdue: "bg-red-100 text-red-800",
  done: "bg-green-100 text-green-800",
};

export default async function TasksPage() {
  const user = await requireRole("owner", "admin");
  const supabase = await createClient();
  const date = today();
  const [{ data: school }, { data: templates }, { data: staff }, { data: recent }] = await Promise.all([
    supabase.from("schools").select("term_start_months").single(),
    supabase
      .from("task_templates")
      .select("id, name, instructions, frequency, weekday, day_of_month, month, assignee_id, active")
      .order("active", { ascending: false })
      .order("name"),
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("role", ["teacher", "admin", "owner"])
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("task_completions")
      .select("id, template_id, due_date, done_at, note, profiles(full_name), task_templates(name)")
      .not("note", "is", null)
      .gte("due_date", addDays(date, -30))
      .order("done_at", { ascending: false })
      .limit(10),
  ]);
  const terms: number[] = school?.term_start_months ?? [1, 5, 9];
  const active = (templates ?? []).filter((t) => t.active);
  const states = new Map((await loadTaskStates(supabase, active)).map((s) => [s.task.id, s]));
  const staffName = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
  const withNotes = recent ?? [];

  return (
    <>
      <PageHeader
        title="Upkeep tasks"
        subtitle="Recurring checks that appear on teachers' task lists. Edit anything to suit the school."
        action={
          <form action={addStarterTasks}>
            <SubmitButton variant="secondary" pendingText="Adding…">
              Add Ghana starter list
            </SubmitButton>
          </form>
        }
      />

      {withNotes.length > 0 && (
        <Card title="Problems reported in the last 30 days" className="mb-6 border-amber-200">
          <ul className="divide-y divide-stone-100 text-sm">
            {withNotes.map((c) => (
              <li key={c.id} className="py-2">
                <span className="font-medium">{(c.task_templates as unknown as { name: string } | null)?.name}</span>
                <span className="text-stone-500">
                  {" "}
                  · {(c.profiles as unknown as { full_name: string } | null)?.full_name} · {formatDay(c.due_date)}
                </span>
                <p className="text-stone-700">{c.note}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Add a task">
        <ActionForm action={createTask}>
          <TaskFields staff={staff ?? []} />
          <SubmitButton>Add task</SubmitButton>
        </ActionForm>
      </Card>

      <div className="mt-6 space-y-3">
        {!templates?.length && <Empty>No tasks yet. The Ghana starter list is a quick way to begin.</Empty>}
        {templates?.map((t) => {
          const s = states.get(t.id);
          return (
            <Card key={t.id} className={t.active ? "" : "opacity-60"}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {t.name}
                    {s && (
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${STATE_BADGE[s.state]}`}>
                        {s.state === "due" ? "due today" : s.state === "overdue" ? `missed ${formatDay(s.dueDate)}` : "done"}
                      </span>
                    )}
                    {!t.active && <span className="ml-2 text-xs text-stone-500">paused</span>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {describeSchedule(t)} · {t.assignee_id ? staffName.get(t.assignee_id) ?? "Former staff" : "Any teacher"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={setTaskActive.bind(null, t.id, !t.active)}>
                    <SubmitButton variant="secondary">{t.active ? "Pause" : "Resume"}</SubmitButton>
                  </form>
                  <form action={deleteTask.bind(null, t.id)}>
                    <SubmitButton variant="danger" pendingText="Removing…">
                      Remove
                    </SubmitButton>
                  </form>
                </div>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-amber-800 underline">Edit</summary>
                <ActionForm action={updateTask.bind(null, t.id)} className="mt-3 space-y-3" resetOnSuccess={false}>
                  <TaskFields task={t} staff={staff ?? []} />
                  <SubmitButton>Save</SubmitButton>
                </ActionForm>
              </details>
            </Card>
          );
        })}
      </div>

      {user.role === "owner" && (
        <Card title="Term dates" className="mt-6">
          <ActionForm action={setTermMonths} resetOnSuccess={false}>
            <p className="text-sm text-stone-600">Months in which a term starts. &quot;Each term&quot; tasks fall due in these months.</p>
            <div className="flex flex-wrap gap-2">
              {MONTHS.map((m, i) => (
                <label
                  key={m}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-stone-300 px-3 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-100"
                >
                  <input type="checkbox" name="months" value={i + 1} defaultChecked={terms.includes(i + 1)} />
                  {m.slice(0, 3)}
                </label>
              ))}
            </div>
            <SubmitButton variant="secondary">Save term months</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
