import { DayNav } from "@/components/day-nav";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { dayRange, formatTime, parseDate, today } from "@/lib/dates";
import { KIND_LABEL, STAGE_LABEL, type LogKind, type Stage } from "@/lib/log-presets";
import { createClient } from "@/lib/supabase/server";

type Log = {
  id: string;
  kind: LogKind;
  body: string | null;
  stage: Stage | null;
  occurred_at: string;
  curriculum_areas: { name: string } | null;
  materials: { name: string } | null;
};

export default async function ParentHome({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireRole("parent");
  const date = parseDate((await searchParams).date) ?? today();
  const { start, end } = dayRange(date);
  const supabase = await createClient();
  // Row-level security limits all of this to the parent's own children.
  const [{ data: children }, { data: attendance }, { data: tags }] = await Promise.all([
    supabase
      .from("children")
      .select("id, first_name, last_name, classes(name), authorised_pickups(id, full_name, relationship)")
      .eq("status", "active")
      .order("first_name"),
    supabase.from("attendance").select("child_id, checked_in_at, checked_out_at, collected_by").eq("date", date),
    supabase
      .from("activity_children")
      .select(
        "child_id, activity_logs!inner(id, kind, body, stage, occurred_at, curriculum_areas(name), materials(name))",
      )
      .gte("activity_logs.occurred_at", start)
      .lt("activity_logs.occurred_at", end),
  ]);
  const attendanceByChild = new Map((attendance ?? []).map((a) => [a.child_id, a]));
  const logsByChild = new Map<string, Log[]>();
  for (const t of tags ?? []) {
    const list = logsByChild.get(t.child_id) ?? [];
    list.push(t.activity_logs as unknown as Log);
    logsByChild.set(t.child_id, list);
  }

  return (
    <>
      <PageHeader title={`Hello, ${user.fullName.split(" ")[0]}`} subtitle="Your child's day at DD Busy Bees." />
      <DayNav basePath="/parent" date={date} />
      {!children?.length && <Empty>No children are linked to your account yet. Please contact the school.</Empty>}
      <div className="space-y-4">
        {children?.map((c) => {
          const cls = c.classes as unknown as { name: string } | null;
          const a = attendanceByChild.get(c.id);
          const logs = (logsByChild.get(c.id) ?? []).sort((x, y) => x.occurred_at.localeCompare(y.occurred_at));
          return (
            <Card key={c.id} title={`${c.first_name} ${c.last_name}`}>
              <p className="text-sm text-stone-600">Class: {cls?.name ?? "not assigned yet"}</p>
              <ol className="mt-3 space-y-3 border-l-2 border-amber-200 pl-4 text-sm">
                {a ? (
                  <li>
                    <span className="text-stone-500">{formatTime(a.checked_in_at)}</span> Arrived at school
                  </li>
                ) : (
                  <li className="text-stone-500">Not checked in{date === today() ? " yet" : ""}.</li>
                )}
                {logs.map((l) => (
                  <li key={l.id}>
                    <span className="text-stone-500">{formatTime(l.occurred_at)}</span>{" "}
                    <span className="font-medium">{KIND_LABEL[l.kind]}</span>
                    {l.materials && ` · ${l.materials.name}`}
                    {!l.materials && l.curriculum_areas && ` · ${l.curriculum_areas.name}`}
                    {l.stage && <span className="text-stone-600"> ({STAGE_LABEL[l.stage].toLowerCase()})</span>}
                    {l.body && <p className="text-stone-700">{l.body}</p>}
                  </li>
                ))}
                {a?.checked_out_at && (
                  <li>
                    <span className="text-stone-500">{formatTime(a.checked_out_at)}</span> Collected by {a.collected_by}
                  </li>
                )}
              </ol>
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-stone-600">Who else may collect {c.first_name}</summary>
                {c.authorised_pickups.length ? (
                  <ul className="mt-1 text-stone-700">
                    {c.authorised_pickups.map((p: { id: string; full_name: string; relationship: string | null }) => (
                      <li key={p.id}>
                        {p.full_name}
                        {p.relationship && ` (${p.relationship})`}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-stone-500">Only you and other linked parents.</p>
                )}
              </details>
            </Card>
          );
        })}
      </div>
    </>
  );
}
