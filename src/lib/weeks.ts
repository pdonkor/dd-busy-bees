import { addDays, today } from "@/lib/dates";

/** Monday of the week containing the date ("YYYY-MM-DD"). */
export function weekStart(date = today()): string {
  const d = new Date(`${date}T00:00:00Z`);
  const iso = d.getUTCDay() || 7;
  return addDays(date, 1 - iso);
}

export function formatWeek(monday: string): string {
  const f = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `Week of ${f(monday)} – ${f(addDays(monday, 4))}`;
}
