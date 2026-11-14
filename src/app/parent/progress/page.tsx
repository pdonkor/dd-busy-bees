import Link from "next/link";
import { ProgressView } from "@/components/progress-view";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export default async function ParentProgress() {
  await requireRole("parent");
  const supabase = await createClient();
  const [{ data: children }, { data: reports }] = await Promise.all([
    supabase.from("children").select("id, first_name").eq("status", "active").order("first_name"),
    // Only reports the office has checked and shared are visible to parents.
    supabase.from("reports").select("id, child_id, body, shared_at, terms(name)").order("shared_at", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader title="Progress" subtitle="What your child is learning, by curriculum area." />
      {!children?.length && <Empty>No children are linked to your account yet.</Empty>}
      <div className="space-y-8">
        {children?.map((c) => {
          const mine = (reports ?? []).filter((r) => r.child_id === c.id);
          return (
            <section key={c.id}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{c.first_name}</h2>
                <Link href={`/parent/child/${c.id}`} className="text-sm text-amber-800 underline">
                  {c.first_name}&apos;s details
                </Link>
              </div>
              <ProgressView supabase={supabase} childId={c.id} />
              {mine.map((r) => (
                <Card key={r.id} title={`Report: ${(r.terms as unknown as { name: string } | null)?.name ?? ""}`} className="mt-4">
                  <p className="mb-2 text-xs text-stone-500">Shared {formatDay(r.shared_at!.slice(0, 10))}</p>
                  <div className="whitespace-pre-wrap text-sm text-stone-800">{r.body}</div>
                </Card>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
