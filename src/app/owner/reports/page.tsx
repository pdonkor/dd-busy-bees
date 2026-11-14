import { revalidatePath } from "next/cache";
import Link from "next/link";
import { z } from "zod";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, PageHeader, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { today } from "@/lib/dates";
import { currentTerm } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { saveReport } from "../../teacher/reports/actions";

async function shareReport(reportId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  "use server";
  await requireRole("owner", "admin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .update({ shared_at: new Date().toISOString() })
    .eq("id", z.string().uuid().parse(reportId))
    .is("shared_at", null);
  if (error) return { error: "That didn't save." };
  revalidatePath("/owner/reports");
  return { success: "Shared. The parents can now read it under Progress." };
}

export default async function OwnerReports({ searchParams }: { searchParams: Promise<{ term?: string; child?: string }> }) {
  await requireRole("owner", "admin");
  const params = await searchParams;
  const supabase = await createClient();
  const { terms, current } = await currentTerm(supabase, today());
  const term = terms.find((t) => t.id === params.term) ?? current;
  if (!term) {
    return (
      <>
        <PageHeader title="Termly reports" />
        <Empty>
          Add the school terms under{" "}
          <Link href="/owner/fees/setup" className="underline">
            Fee plans and terms
          </Link>{" "}
          first.
        </Empty>
      </>
    );
  }
  const [{ data: children }, { data: reports }] = await Promise.all([
    supabase.from("children").select("id, first_name, last_name, classes(name)").eq("status", "active").order("first_name"),
    supabase.from("reports").select("id, child_id, body, shared_at, updated_at, profiles!reports_author_id_fkey(full_name)").eq("term_id", term.id),
  ]);
  const selected = children?.find((c) => c.id === params.child);
  const report = reports?.find((r) => r.child_id === selected?.id);
  const shared = (reports ?? []).filter((r) => r.shared_at).length;

  return (
    <>
      <PageHeader
        title="Termly reports"
        subtitle={`${term.name}: ${reports?.length ?? 0} written, ${shared} shared with parents, of ${children?.length ?? 0} children.`}
      />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {terms.slice(0, 4).map((t) => (
          <Link
            key={t.id}
            href={`/owner/reports?term=${t.id}`}
            className={`rounded-full border px-3 py-1 ${t.id === term.id ? "border-amber-500 bg-amber-100" : "border-stone-300 bg-white"}`}
          >
            {t.name}
          </Link>
        ))}
      </nav>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card title="Children">
          <ul className="divide-y divide-stone-100 text-sm">
            {children?.map((c) => {
              const r = reports?.find((x) => x.child_id === c.id);
              return (
                <li key={c.id}>
                  <Link href={`/owner/reports?term=${term.id}&child=${c.id}`} className={`flex justify-between py-2 ${c.id === selected?.id ? "font-semibold" : ""}`}>
                    <span>
                      {c.first_name} {c.last_name}
                    </span>
                    <span className={`text-xs ${r?.shared_at ? "text-green-700" : r ? "text-amber-700" : "text-stone-400"}`}>
                      {r ? (r.shared_at ? "shared" : "ready to check") : "not written"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
        {selected && report ? (
          <Card title={`${selected.first_name}'s report`}>
            <p className="mb-2 text-xs text-stone-500">
              Written by {(report.profiles as unknown as { full_name: string } | null)?.full_name}
            </p>
            <ActionForm action={saveReport.bind(null, selected.id, term.id)} resetOnSuccess={false}>
              <Textarea name="body" rows={18} maxLength={12000} defaultValue={report.body} aria-label="Report" />
              <SubmitButton variant="secondary">Save changes</SubmitButton>
            </ActionForm>
            {!report.shared_at && (
              <ActionForm action={shareReport.bind(null, report.id)} className="mt-3">
                <SubmitButton>Share with parents</SubmitButton>
              </ActionForm>
            )}
          </Card>
        ) : (
          <Empty>{selected ? `${selected.first_name}'s teacher hasn't written a report yet.` : "Choose a child."}</Empty>
        )}
      </div>
    </>
  );
}
