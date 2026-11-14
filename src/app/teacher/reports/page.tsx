import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, PageHeader, Textarea } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { today } from "@/lib/dates";
import { buildDraft, currentTerm } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { saveReport } from "./actions";

export default async function TeacherReports({ searchParams }: { searchParams: Promise<{ child?: string; term?: string }> }) {
  await requireRole("teacher");
  const params = await searchParams;
  const supabase = await createClient();
  const { terms, current } = await currentTerm(supabase, today());
  const term = terms.find((t) => t.id === params.term) ?? current;
  if (!term) {
    return (
      <>
        <PageHeader title="Termly reports" />
        <Empty>The office hasn&apos;t set up the school terms yet.</Empty>
      </>
    );
  }
  const [{ data: children }, { data: reports }] = await Promise.all([
    supabase.from("children").select("id, first_name, last_name").eq("status", "active").order("first_name"),
    supabase.from("reports").select("child_id, body, shared_at").eq("term_id", term.id),
  ]);
  const selected = children?.find((c) => c.id === params.child);
  const report = reports?.find((r) => r.child_id === selected?.id);
  const draft = selected && !report ? await buildDraft(supabase, selected.id, term.id) : null;

  return (
    <>
      <PageHeader title="Termly reports" subtitle={`${term.name}. The app writes a first draft from your logs; you check and finish it.`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card title="Children">
          <ul className="divide-y divide-stone-100 text-sm">
            {children?.map((c) => {
              const r = reports?.find((x) => x.child_id === c.id);
              return (
                <li key={c.id}>
                  <Link
                    href={`/teacher/reports?term=${term.id}&child=${c.id}`}
                    className={`flex justify-between py-2 ${c.id === selected?.id ? "font-semibold" : ""}`}
                  >
                    <span>
                      {c.first_name} {c.last_name}
                    </span>
                    <span className="text-xs text-stone-500">{r ? (r.shared_at ? "shared" : "draft saved") : "not started"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
        {selected ? (
          <Card title={`${selected.first_name}'s report`}>
            {report?.shared_at ? (
              <>
                <p className="mb-2 text-sm text-green-800">The office has shared this report with the parents.</p>
                <div className="whitespace-pre-wrap text-sm">{report.body}</div>
              </>
            ) : (
              <ActionForm action={saveReport.bind(null, selected.id, term.id)} resetOnSuccess={false}>
                {!report && <p className="text-sm text-amber-800">This is a draft written from the logs. Check it and add your comments.</p>}
                <Textarea name="body" rows={18} maxLength={12000} defaultValue={report?.body ?? draft ?? ""} aria-label="Report" />
                <SubmitButton>Save report</SubmitButton>
              </ActionForm>
            )}
          </Card>
        ) : (
          <Empty>Choose a child to write their report.</Empty>
        )}
      </div>
    </>
  );
}
