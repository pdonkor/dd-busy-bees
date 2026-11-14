import "server-only";
import { loadProgress } from "@/components/progress-view";
import { draftReport } from "@/lib/progress";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Builds the first draft of a child's termly report from that term's logs and attendance. */
export async function buildDraft(supabase: Supabase, childId: string, termId: string): Promise<string | null> {
  const [{ data: child }, { data: term }] = await Promise.all([
    supabase.from("children").select("first_name").eq("id", childId).maybeSingle(),
    supabase.from("terms").select("name, starts_on, ends_on").eq("id", termId).maybeSingle(),
  ]);
  if (!child || !term) return null;
  const [areas, { count }] = await Promise.all([
    loadProgress(supabase, childId, term.starts_on, term.ends_on),
    supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("child_id", childId)
      .gte("date", term.starts_on)
      .lte("date", term.ends_on),
  ]);
  return draftReport({ firstName: child.first_name, termName: term.name, areas, daysAttended: count ?? 0, notes: [] });
}

/** The term in progress, else the one that ended most recently. */
export async function currentTerm(supabase: Supabase, date: string) {
  const { data: terms } = await supabase.from("terms").select("id, name, starts_on, ends_on").order("starts_on", { ascending: false });
  return {
    terms: terms ?? [],
    current: (terms ?? []).find((t) => t.starts_on <= date) ?? null,
  };
}
