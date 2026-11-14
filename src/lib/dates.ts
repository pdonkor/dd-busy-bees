// Ghana keeps GMT all year (no daylight saving), so a school day in Accra is the
// same as a UTC calendar day. These helpers work on "YYYY-MM-DD" strings.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Accra. */
export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The date as given if it is a real "YYYY-MM-DD" date, otherwise null. */
export function parseDate(value: string | undefined | null): string | null {
  if (!value || !DATE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Start and end (exclusive) of the day as timestamps, for filtering timestamptz columns. */
export function dayRange(date: string): { start: string; end: string } {
  return { start: `${date}T00:00:00Z`, end: `${addDays(date, 1)}T00:00:00Z` };
}

export function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });
}
