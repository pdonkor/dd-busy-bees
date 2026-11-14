import type { ReactNode } from "react";
import { Card, Empty } from "@/components/ui";
import { formatDay, today } from "@/lib/dates";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const KIND_LABEL: Record<string, string> = { event: "Event", closure: "School closed", meeting: "Meeting", holiday: "Holiday" };

export function dateRange(start: string, end: string) {
  return start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

/** Announcements and the upcoming calendar, as the logged-in user is allowed to see them. */
export async function Notices({
  supabase,
  announcementExtra,
  eventExtra,
}: {
  supabase: Supabase;
  announcementExtra?: (a: { id: string }) => ReactNode;
  eventExtra?: (e: { id: string }) => ReactNode;
}) {
  const date = today();
  const [{ data: announcements }, { data: events }, { data: terms }] = await Promise.all([
    supabase.from("announcements").select("id, title, body, created_at, classes(name)").order("created_at", { ascending: false }).limit(30),
    supabase.from("events").select("id, title, kind, starts_on, ends_on, notes, classes(name)").gte("ends_on", date).order("starts_on").limit(50),
    supabase.from("terms").select("id, name, starts_on, ends_on").gte("ends_on", date).order("starts_on").limit(3),
  ]);
  const calendar = [
    ...(terms ?? []).flatMap((t) => [
      { id: `t-start-${t.id}`, title: `${t.name} starts`, kind: "term", starts_on: t.starts_on, ends_on: t.starts_on, notes: null, cls: null, real: false },
      { id: `t-end-${t.id}`, title: `${t.name} ends`, kind: "term", starts_on: t.ends_on, ends_on: t.ends_on, notes: null, cls: null, real: false },
    ]),
    ...(events ?? []).map((e) => ({ ...e, cls: (e.classes as unknown as { name: string } | null)?.name ?? null, real: true })),
  ]
    .filter((e) => e.ends_on >= date)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Announcements">
        {!announcements?.length && <Empty>No announcements yet.</Empty>}
        <ul className="space-y-4">
          {announcements?.map((a) => (
            <li key={a.id}>
              <p className="font-medium">{a.title}</p>
              <p className="text-xs text-stone-500">
                {formatDay(a.created_at.slice(0, 10))}
                {(a.classes as unknown as { name: string } | null)?.name && ` · ${(a.classes as unknown as { name: string }).name} only`}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{a.body}</p>
              {announcementExtra?.(a)}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Coming up">
        {!calendar.length && <Empty>Nothing on the calendar.</Empty>}
        <ul className="divide-y divide-stone-100 text-sm">
          {calendar.map((e) => (
            <li key={e.id} className="py-2">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{e.title}</span>
                <span className="text-stone-600">{dateRange(e.starts_on, e.ends_on)}</span>
              </div>
              <p className="text-xs text-stone-500">
                {e.kind === "term" ? "Term dates" : KIND_LABEL[e.kind]}
                {e.cls && ` · ${e.cls} only`}
                {e.notes && ` · ${e.notes}`}
              </p>
              {e.real && eventExtra?.(e)}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
