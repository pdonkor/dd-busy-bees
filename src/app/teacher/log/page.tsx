import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { dayRange, formatTime, today } from "@/lib/dates";
import { KIND_LABEL, STAGE_LABEL, type LogKind, type Stage } from "@/lib/log-presets";
import { createClient } from "@/lib/supabase/server";
import { deleteLog } from "../actions";
import { LogForm } from "./log-form";

export default async function LogPage() {
  const user = await requireRole("teacher");
  const supabase = await createClient();
  const { start, end } = dayRange(today());
  const [{ data: assignments }, { data: children }, { data: areas }, { data: logs }] = await Promise.all([
    supabase.from("staff_assignments").select("classes(id, name)").eq("teacher_id", user.id),
    supabase.from("children").select("id, first_name, last_name, class_id").eq("status", "active").order("first_name"),
    supabase
      .from("curriculum_areas")
      .select("id, name, materials(id, name, position)")
      .order("position")
      .order("position", { referencedTable: "materials" }),
    supabase
      .from("activity_logs")
      .select("id, kind, body, stage, occurred_at, curriculum_areas(name), materials(name), activity_children(children(first_name))")
      .eq("logged_by", user.id)
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .order("occurred_at", { ascending: false }),
  ]);

  const groups = (assignments ?? [])
    .map((a) => a.classes as unknown as { id: string; name: string } | null)
    .filter((c): c is { id: string; name: string } => !!c)
    .map((cls) => ({
      ...cls,
      children: (children ?? [])
        .filter((c) => c.class_id === cls.id)
        .map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name.charAt(0)}.` })),
    }));

  return (
    <>
      <PageHeader title="Log activity" subtitle="Tap the children, pick what happened and you're done." />
      {groups.length ? (
        <Card>
          <LogForm
            groups={groups}
            areas={(areas ?? []).map((a) => ({ id: a.id, name: a.name, materials: a.materials }))}
          />
        </Card>
      ) : (
        <Empty>You haven&apos;t been added to a class yet. Please ask the school office.</Empty>
      )}
      <Card title="Logged by you today" className="mt-6">
        {!logs?.length && <p className="text-sm text-stone-500">Nothing yet.</p>}
        <ul className="divide-y divide-stone-100">
          {logs?.map((l) => {
            const area = l.curriculum_areas as unknown as { name: string } | null;
            const material = l.materials as unknown as { name: string } | null;
            const names = (l.activity_children as unknown as { children: { first_name: string } | null }[])
              .map((t) => t.children?.first_name)
              .filter(Boolean)
              .join(", ");
            return (
              <li key={l.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div>
                  <p>
                    <span className="font-medium">{KIND_LABEL[l.kind as LogKind]}</span>
                    {material && ` · ${material.name}`}
                    {!material && area && ` · ${area.name}`}
                    {l.stage && ` · ${STAGE_LABEL[l.stage as Stage]}`}
                    <span className="text-stone-500"> · {formatTime(l.occurred_at)}</span>
                  </p>
                  {l.body && <p className="text-stone-700">{l.body}</p>}
                  <p className="text-xs text-stone-500">{names}</p>
                </div>
                <form action={deleteLog.bind(null, l.id)}>
                  <button className="min-h-10 px-2 text-red-700 underline">Delete</button>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
