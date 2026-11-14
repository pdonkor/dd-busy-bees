import { Card, Empty } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { STAGE_LABEL } from "@/lib/log-presets";
import { progressByArea, type ProgressLog } from "@/lib/progress";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const STAGE_STYLE = {
  presented: "bg-stone-100 text-stone-700",
  practising: "bg-amber-100 text-amber-900",
  mastered: "bg-green-100 text-green-800",
} as const;

/** Loads a child's curriculum logs (as the logged-in user) and groups them by area. */
export async function loadProgress(supabase: Supabase, childId: string, since?: string, until?: string) {
  let query = supabase
    .from("activity_children")
    .select(
      "activity_logs!inner(occurred_at, stage, kind, curriculum_areas(id, name, position), materials(id, name, position))",
    )
    .eq("child_id", childId)
    .eq("activity_logs.kind", "activity");
  if (since) query = query.gte("activity_logs.occurred_at", `${since}T00:00:00Z`);
  if (until) query = query.lte("activity_logs.occurred_at", `${until}T23:59:59Z`);
  const { data } = await query;
  const logs: ProgressLog[] = (data ?? []).map((row) => {
    const l = row.activity_logs as unknown as {
      occurred_at: string;
      stage: ProgressLog["stage"];
      curriculum_areas: ProgressLog["area"];
      materials: ProgressLog["material"];
    };
    return { occurred_at: l.occurred_at, stage: l.stage, area: l.curriculum_areas, material: l.materials };
  });
  return progressByArea(logs);
}

export async function ProgressView({ supabase, childId }: { supabase: Supabase; childId: string }) {
  const areas = await loadProgress(supabase, childId);
  if (!areas.length) return <Empty>No curriculum work has been logged yet.</Empty>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {areas.map((area) => (
        <Card key={area.id} title={area.name}>
          <ul className="divide-y divide-stone-100 text-sm">
            {area.materials.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {m.name}
                  <span className="block text-xs text-stone-500">
                    {m.times} {m.times === 1 ? "time" : "times"} · last {formatDay(m.lastSeen.slice(0, 10))}
                  </span>
                </span>
                {m.stage && <span className={`rounded-full px-2 py-0.5 text-xs ${STAGE_STYLE[m.stage]}`}>{STAGE_LABEL[m.stage]}</span>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
