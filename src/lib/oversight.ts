import "server-only";
import { addDays, dayRange, today } from "@/lib/dates";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ClassRatio = {
  id: string;
  name: string;
  childrenIn: number;
  staffIn: number;
  ratio: number | null;
  /** True when there are more children than the ratio allows for the staff present. */
  over: boolean;
};

/**
 * Live ratio per class: children checked in and not yet collected, against the
 * class's teachers who are clocked in and not yet clocked out.
 */
export async function classRatios(supabase: Supabase): Promise<ClassRatio[]> {
  const date = today();
  const [{ data: classes }, { data: attendance }, { data: shifts }, { data: assignments }] = await Promise.all([
    supabase.from("classes").select("id, name, ratio_children_per_adult").eq("archived", false).order("name"),
    supabase.from("attendance").select("checked_out_at, children!inner(class_id)").eq("date", date).is("checked_out_at", null),
    supabase.from("staff_shifts").select("staff_id").eq("date", date).is("clock_out_at", null),
    supabase.from("staff_assignments").select("teacher_id, class_id"),
  ]);
  const onSite = new Set((shifts ?? []).map((s) => s.staff_id));
  return (classes ?? []).map((c) => {
    const childrenIn = (attendance ?? []).filter((a) => (a.children as unknown as { class_id: string | null }).class_id === c.id).length;
    const staffIn = (assignments ?? []).filter((a) => a.class_id === c.id && onSite.has(a.teacher_id)).length;
    const ratio = c.ratio_children_per_adult;
    return { id: c.id, name: c.name, childrenIn, staffIn, ratio, over: ratio != null && childrenIn > ratio * staffIn };
  });
}

/** Children with nothing logged today (among those in), and active children with no curriculum activity this week. */
export async function coverage(supabase: Supabase) {
  const date = today();
  const { start, end } = dayRange(date);
  const weekAgo = `${addDays(date, -7)}T00:00:00Z`;
  const [{ data: children }, { data: present }, { data: todayTags }, { data: weekTags }, { data: logs }, { data: staff }] =
    await Promise.all([
      supabase.from("children").select("id, first_name, last_name, classes(name)").eq("status", "active").order("first_name"),
      supabase.from("attendance").select("child_id").eq("date", date),
      supabase
        .from("activity_children")
        .select("child_id, activity_logs!inner(occurred_at)")
        .gte("activity_logs.occurred_at", start)
        .lt("activity_logs.occurred_at", end),
      supabase
        .from("activity_children")
        .select("child_id, activity_logs!inner(occurred_at, kind)")
        .eq("activity_logs.kind", "activity")
        .gte("activity_logs.occurred_at", weekAgo),
      supabase.from("activity_logs").select("logged_by, occurred_at").gte("occurred_at", weekAgo),
      supabase.from("profiles").select("id, full_name").eq("role", "teacher").eq("active", true).order("full_name"),
    ]);
  const presentIds = new Set((present ?? []).map((p) => p.child_id));
  const loggedToday = new Set((todayTags ?? []).map((t) => t.child_id));
  const activeThisWeek = new Set((weekTags ?? []).map((t) => t.child_id));
  const name = (c: { first_name: string; last_name: string }) => `${c.first_name} ${c.last_name}`;
  return {
    noLogToday: (children ?? []).filter((c) => presentIds.has(c.id) && !loggedToday.has(c.id)).map((c) => ({ id: c.id, name: name(c) })),
    noActivityThisWeek: (children ?? []).filter((c) => !activeThisWeek.has(c.id)).map((c) => ({ id: c.id, name: name(c) })),
    teacherLogs: (staff ?? []).map((s) => ({
      id: s.id,
      name: s.full_name,
      week: (logs ?? []).filter((l) => l.logged_by === s.id).length,
      today: (logs ?? []).filter((l) => l.logged_by === s.id && l.occurred_at >= start).length,
    })),
  };
}
