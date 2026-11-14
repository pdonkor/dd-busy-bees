import { KIND_LABEL, STAGE_LABEL, type LogKind, type Stage } from "@/lib/log-presets";

export type SummaryLog = {
  kind: LogKind;
  body: string | null;
  stage: Stage | null;
  occurred_at: string;
  material: string | null;
  area: string | null;
};

const time = (ts: string) =>
  new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

/**
 * The end-of-day SMS for one child, built from what teachers already logged, so no
 * teacher ever writes an individual update. Kept to about two SMS pages (306
 * characters); the full day, with photos, is in the app.
 */
export function dailySummary(
  firstName: string,
  attendance: { checked_in_at: string; checked_out_at: string | null; collected_by: string | null },
  logs: SummaryLog[],
  appUrl: string,
): string {
  const parts: string[] = [`Arrived ${time(attendance.checked_in_at)}`];
  const sorted = [...logs].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const activities = sorted
    .filter((l) => l.kind === "activity")
    .map((l) => {
      const what = l.material ?? l.area ?? "activity";
      return l.stage ? `${what} (${STAGE_LABEL[l.stage].toLowerCase()})` : what;
    });
  if (activities.length) parts.push(`Worked on: ${[...new Set(activities)].join(", ")}`);
  for (const kind of ["meal", "nap", "mood"] as const) {
    const notes = sorted.filter((l) => l.kind === kind && l.body).map((l) => l.body!);
    if (notes.length) parts.push(`${KIND_LABEL[kind]}: ${notes.join("; ")}`);
  }
  if (attendance.checked_out_at) {
    parts.push(`Collected ${time(attendance.checked_out_at)}${attendance.collected_by ? ` by ${attendance.collected_by}` : ""}`);
  }
  const head = `DD Busy Bees: ${firstName}'s day. `;
  const tail = `. More: ${appUrl}/parent`;
  const max = 306 - head.length - tail.length;
  let body = parts.join(". ");
  if (body.length > max) body = `${body.slice(0, max - 1).trimEnd()}…`;
  return head + body + tail;
}
