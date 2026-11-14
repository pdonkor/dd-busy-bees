import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { minutesLate } from "@/lib/clock";
import { addDays, formatDay, formatTime, today } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { WEEKDAYS } from "@/lib/tasks";
import { closeShift, removeRotaDay, saveRota } from "./actions";

const hhmm = (t: string) => t.slice(0, 5);

export default async function StaffTimePage() {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  const date = today();
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  const [{ data: staff }, { data: rota }, { data: shifts }, { data: school }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "teacher").eq("active", true).order("full_name"),
    supabase.from("staff_rota").select("staff_id, weekday, starts_at, ends_at").order("weekday"),
    supabase
      .from("staff_shifts")
      .select("id, staff_id, date, clock_in_at, clock_out_at, in_distance_m, corrected_by")
      .gte("date", addDays(date, -13))
      .order("date", { ascending: false }),
    supabase.from("schools").select("latitude, late_after_min").single(),
  ]);
  const grace = school?.late_after_min ?? 10;
  const rotaFor = (id: string, wd: number) => rota?.find((r) => r.staff_id === id && r.weekday === wd);
  const name = new Map((staff ?? []).map((s) => [s.id, s.full_name]));

  const todayRows = (staff ?? []).map((s) => {
    const planned = rotaFor(s.id, weekday);
    const shift = shifts?.find((x) => x.staff_id === s.id && x.date === date);
    const late = shift && planned ? minutesLate(shift.clock_in_at, planned.starts_at, grace) : 0;
    const missing = !shift && planned && new Date().toISOString().slice(11, 16) > hhmm(planned.starts_at);
    return { s, planned, shift, late, missing };
  });

  return (
    <>
      <PageHeader
        title="Staff on site"
        subtitle="Clock-ins from the entrance QR code, checked against each person's planned hours."
        action={
          <Link href="/owner/clock-board" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-950">
            Open entrance QR screen
          </Link>
        }
      />
      {school?.latitude == null && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The school&apos;s location isn&apos;t set, so clock-ins aren&apos;t checked against the premises yet.{" "}
          <Link href="/owner/settings" className="underline">
            Set it in Settings
          </Link>
          .
        </p>
      )}
      <Card title={`Today · ${formatDay(date)}`}>
        {!todayRows.length && <Empty>No active teachers yet.</Empty>}
        <ul className="divide-y divide-stone-100 text-sm">
          {todayRows.map(({ s, planned, shift, late, missing }) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium">{s.full_name}</span>
              <span className="text-stone-600">
                {planned ? `Planned ${hhmm(planned.starts_at)}–${hhmm(planned.ends_at)} · ` : "Not on today's rota · "}
                {shift ? (
                  <>
                    In {formatTime(shift.clock_in_at)}
                    {shift.clock_out_at && `, out ${formatTime(shift.clock_out_at)}`}
                    {late > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 text-amber-900">{late} min late</span>}
                  </>
                ) : missing ? (
                  <span className="rounded-full bg-red-100 px-2 text-red-800">not clocked in</span>
                ) : (
                  "not in yet"
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Planned hours (rota)">
          <ActionForm action={saveRota}>
            <Field label="Teacher">
              <Select name="staff_id" required defaultValue="">
                <option value="">Choose…</option>
                {staff?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="flex flex-wrap gap-2 text-sm">
              <legend className="mb-1 font-medium text-stone-800">Days</legend>
              {WEEKDAYS.slice(0, 6).map((d, i) => (
                <label key={d} className="flex min-h-10 items-center gap-1 rounded-lg border border-stone-300 px-2">
                  <input type="checkbox" name="weekdays" value={i + 1} defaultChecked={i < 5} />
                  {d.slice(0, 3)}
                </label>
              ))}
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                <Input name="starts_at" type="time" defaultValue="07:30" required />
              </Field>
              <Field label="Finishes">
                <Input name="ends_at" type="time" defaultValue="15:30" required />
              </Field>
            </div>
            <SubmitButton>Save rota</SubmitButton>
          </ActionForm>
          <ul className="mt-4 divide-y divide-stone-100 text-sm">
            {rota?.map((r) => (
              <li key={`${r.staff_id}-${r.weekday}`} className="flex items-center justify-between py-1">
                <span>
                  {name.get(r.staff_id) ?? "Former staff"} · {WEEKDAYS[r.weekday - 1]} {hhmm(r.starts_at)}–{hhmm(r.ends_at)}
                </span>
                <form action={removeRotaDay.bind(null, r.staff_id, r.weekday)}>
                  <button className="min-h-10 px-2 text-red-700 underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Last two weeks">
          {!shifts?.length && <Empty>No clock-ins yet.</Empty>}
          <ul className="divide-y divide-stone-100 text-sm">
            {shifts?.map((sh) => {
              const planned = rotaFor(sh.staff_id, new Date(`${sh.date}T00:00:00Z`).getUTCDay() || 7);
              const late = planned ? minutesLate(sh.clock_in_at, planned.starts_at, grace) : 0;
              return (
                <li key={sh.id} className="py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>
                      {name.get(sh.staff_id) ?? "Former staff"} · {formatDay(sh.date)}
                    </span>
                    <span className="text-stone-600">
                      {formatTime(sh.clock_in_at)} – {sh.clock_out_at ? formatTime(sh.clock_out_at) : "?"}
                      {late > 0 && <span className="ml-1 text-amber-800">({late} min late)</span>}
                      {sh.corrected_by && <span className="ml-1 text-stone-500">(corrected)</span>}
                    </span>
                  </div>
                  {!sh.clock_out_at && sh.date < date && (
                    <form action={closeShift.bind(null, sh.id)} className="mt-1 flex items-center gap-2">
                      <Input name="time" type="time" required className="w-32" aria-label="Clock-out time" />
                      <button className="min-h-10 px-2 text-amber-800 underline">Record clock-out</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
