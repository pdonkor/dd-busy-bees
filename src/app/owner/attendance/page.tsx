import { DayNav } from "@/components/day-nav";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatTime, parseDate, today } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { deleteAttendance } from "./actions";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireRole("owner", "admin");
  const date = parseDate((await searchParams).date) ?? today();
  const supabase = await createClient();
  const [{ data: classes }, { data: children }, { data: attendance }] = await Promise.all([
    supabase.from("classes").select("id, name").eq("archived", false).order("name"),
    supabase.from("children").select("id, first_name, last_name, class_id").eq("status", "active").order("first_name"),
    supabase
      .from("attendance")
      .select(
        "id, child_id, checked_in_at, checked_out_at, collected_by, collected_by_unlisted, checked_in:profiles!attendance_checked_in_by_fkey(full_name), checked_out:profiles!attendance_checked_out_by_fkey(full_name)",
      )
      .eq("date", date),
  ]);
  const byChild = new Map((attendance ?? []).map((a) => [a.child_id, a]));
  const groups = [
    ...(classes ?? []).map((c) => ({ id: c.id, name: c.name })),
    { id: null as string | null, name: "No class" },
  ]
    .map((g) => ({ ...g, children: (children ?? []).filter((c) => c.class_id === g.id) }))
    .filter((g) => g.children.length);
  const present = (attendance ?? []).length;

  return (
    <>
      <PageHeader title="Attendance" subtitle={`${present} of ${children?.length ?? 0} children checked in`} />
      <DayNav basePath="/owner/attendance" date={date} />
      {!groups.length && <Empty>No children enrolled yet.</Empty>}
      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.id ?? "none"} title={g.name}>
            <ul className="divide-y divide-stone-100 text-sm">
              {g.children.map((c) => {
                const a = byChild.get(c.id);
                const by = (x: unknown) => (x as { full_name: string } | null)?.full_name;
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">
                      {c.first_name} {c.last_name}
                    </span>
                    {a ? (
                      <span className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                        In {formatTime(a.checked_in_at)} ({by(a.checked_in)})
                        {a.checked_out_at && (
                          <>
                            {" "}
                            · Out {formatTime(a.checked_out_at)} with {a.collected_by} ({by(a.checked_out)})
                          </>
                        )}
                        {a.collected_by_unlisted && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">not on pick-up list</span>
                        )}
                        <form action={deleteAttendance.bind(null, a.id)}>
                          <button className="min-h-10 px-2 text-red-700 underline">Remove</button>
                        </form>
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400">Absent</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
