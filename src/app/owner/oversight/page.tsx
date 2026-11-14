import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { classRatios, coverage } from "@/lib/oversight";
import { createClient } from "@/lib/supabase/server";
import { loadTaskStates } from "@/lib/task-status";

export default async function OversightPage() {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  const [ratios, cover, { data: tasks }, { data: staff }, { count: openIncidents }] = await Promise.all([
    classRatios(supabase),
    coverage(supabase),
    supabase.from("task_templates").select("id, name, frequency, weekday, day_of_month, month, assignee_id").eq("active", true),
    supabase.from("profiles").select("id, full_name").in("role", ["teacher", "admin", "owner"]),
    supabase.from("incidents").select("id", { count: "exact", head: true }).is("owner_signoff_at", null),
  ]);
  const overdue = (await loadTaskStates(supabase, tasks ?? [])).filter((s) => s.state === "overdue");
  const staffName = new Map((staff ?? []).map((s) => [s.id, s.full_name]));

  return (
    <>
      <PageHeader title="Oversight" subtitle="Ratios, logging coverage and overdue upkeep, so nothing slips." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ratios right now">
          {!ratios.length && <Empty>No classes yet.</Empty>}
          <ul className="divide-y divide-stone-100 text-sm">
            {ratios.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span className="font-medium">{r.name}</span>
                <span className={r.over ? "font-semibold text-red-800" : "text-stone-700"}>
                  {r.childrenIn} children · {r.staffIn} staff
                  {r.ratio ? ` · limit 1:${r.ratio}` : " · no ratio set"}
                  {r.over && " · OVER RATIO"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">
            Staff count only teachers of that class who have clocked in. Set ratios on the{" "}
            <Link href="/owner/classes" className="underline">
              Classes
            </Link>{" "}
            page.
          </p>
        </Card>
        <Card title="Teacher logging">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-600">
                <th className="py-1 font-medium">Teacher</th>
                <th className="py-1 text-right font-medium">Today</th>
                <th className="py-1 text-right font-medium">Last 7 days</th>
              </tr>
            </thead>
            <tbody>
              {cover.teacherLogs.map((t) => (
                <tr key={t.id} className="border-t border-stone-100">
                  <td className="py-1">{t.name}</td>
                  <td className="py-1 text-right">{t.today}</td>
                  <td className="py-1 text-right">{t.week}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!!openIncidents && (
            <Link href="/owner/incidents" className="mt-3 block text-sm text-red-800 underline">
              {openIncidents} incident {openIncidents === 1 ? "report needs" : "reports need"} sign-off
            </Link>
          )}
        </Card>
        <Card title="In today, nothing logged yet">
          {!cover.noLogToday.length && <p className="text-sm text-stone-500">Every child in today has at least one log.</p>}
          <p className="text-sm">{cover.noLogToday.map((c) => c.name).join(", ")}</p>
        </Card>
        <Card title="No curriculum activity in 7 days">
          {!cover.noActivityThisWeek.length && <p className="text-sm text-stone-500">Every child has had an activity logged.</p>}
          <p className="text-sm">
            {cover.noActivityThisWeek.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link href={`/owner/children/${c.id}/progress`} className="underline">
                  {c.name}
                </Link>
              </span>
            ))}
          </p>
        </Card>
        <Card title="Overdue upkeep tasks">
          {!overdue.length && <p className="text-sm text-stone-500">Nothing overdue.</p>}
          <ul className="text-sm">
            {overdue.map((s) => (
              <li key={s.task.id} className="py-1">
                {s.task.name} · due {s.dueDate} · {s.task.assignee_id ? staffName.get(s.task.assignee_id) : "any teacher"}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
