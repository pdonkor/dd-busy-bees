import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { minutesLate } from "@/lib/clock";
import { addDays, formatDay, formatTime, today } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { ClockScanner } from "./clock-scanner";

export default async function ClockPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requireRole("teacher");
  const { c } = await searchParams;
  const supabase = await createClient();
  const [{ data: shifts }, { data: rota }, { data: school }] = await Promise.all([
    supabase
      .from("staff_shifts")
      .select("id, date, clock_in_at, clock_out_at")
      .eq("staff_id", user.id)
      .gte("date", addDays(today(), -30))
      .order("date", { ascending: false }),
    supabase.from("staff_rota").select("weekday, starts_at").eq("staff_id", user.id),
    supabase.from("schools").select("late_after_min").single(),
  ]);
  const startByDay = new Map((rota ?? []).map((r) => [r.weekday, r.starts_at as string]));
  const grace = school?.late_after_min ?? 10;
  const lateCount = (shifts ?? []).filter((s) => {
    const wd = new Date(`${s.date}T00:00:00Z`).getUTCDay() || 7;
    const start = startByDay.get(wd);
    return start && minutesLate(s.clock_in_at, start, grace) > 0;
  }).length;

  return (
    <>
      <PageHeader title="Clock in and out" subtitle="Scan the code on the screen at the entrance with your phone camera." />
      {c && (
        <div className="mb-4">
          <ClockScanner code={c} />
        </div>
      )}
      <Card title="Your last 30 days">
        <p className="mb-3 text-sm text-stone-600">
          {shifts?.length ?? 0} days at school · {lateCount} late {lateCount === 1 ? "arrival" : "arrivals"}
        </p>
        <ul className="divide-y divide-stone-100 text-sm">
          {shifts?.map((s) => (
            <li key={s.id} className="flex justify-between py-2">
              <span>{formatDay(s.date)}</span>
              <span className="text-stone-600">
                {formatTime(s.clock_in_at)} – {s.clock_out_at ? formatTime(s.clock_out_at) : "not clocked out"}
              </span>
            </li>
          ))}
        </ul>
        {!shifts?.length && <p className="text-sm text-stone-500">No clock-ins yet.</p>}
      </Card>
      <p className="mt-4 text-sm">
        <Link href="/teacher" className="text-amber-800 underline">
          Back to my day
        </Link>
      </p>
    </>
  );
}
