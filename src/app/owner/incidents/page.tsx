import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDay, formatTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { signOffIncident } from "./actions";

const KIND = { accident: "Accident", incident: "Incident", illness: "Illness" } as Record<string, string>;

export default async function IncidentsPage() {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  const { data: incidents } = await supabase
    .from("incidents")
    .select(
      "id, kind, occurred_at, description, action_taken, parent_ack_at, owner_signoff_at, owner_note, children(first_name, last_name), reporter:profiles!incidents_reported_by_fkey(full_name)",
    )
    .order("occurred_at", { ascending: false })
    .limit(100);
  const open = (incidents ?? []).filter((i) => !i.owner_signoff_at);
  const done = (incidents ?? []).filter((i) => i.owner_signoff_at);

  const row = (i: NonNullable<typeof incidents>[number]) => {
    const child = i.children as unknown as { first_name: string; last_name: string } | null;
    const reporter = i.reporter as unknown as { full_name: string } | null;
    return (
      <Card key={i.id}>
        <div className="flex flex-wrap justify-between gap-2">
          <p className="font-semibold">
            {KIND[i.kind]}: {child?.first_name} {child?.last_name}
          </p>
          <p className="text-sm text-stone-600">
            {formatDay(i.occurred_at.slice(0, 10))} {formatTime(i.occurred_at)} · by {reporter?.full_name}
          </p>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm">{i.description}</p>
        {i.action_taken && <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">Action: {i.action_taken}</p>}
        <p className="mt-2 text-xs">
          {i.parent_ack_at ? (
            <span className="text-green-800">Parent acknowledged {formatDay(i.parent_ack_at.slice(0, 10))}</span>
          ) : (
            <span className="text-amber-800">Not yet acknowledged by a parent</span>
          )}
          {i.owner_signoff_at && <span className="ml-2 text-green-800">· Signed off {formatDay(i.owner_signoff_at.slice(0, 10))}</span>}
        </p>
        {i.owner_note && <p className="text-xs text-stone-600">Office note: {i.owner_note}</p>}
        {!i.owner_signoff_at && (
          <ActionForm action={signOffIncident.bind(null, i.id)} className="mt-2 flex flex-wrap gap-2">
            <Input name="owner_note" placeholder="Note (optional)" maxLength={2000} className="w-auto flex-1" />
            <SubmitButton variant="secondary">Sign off</SubmitButton>
          </ActionForm>
        )}
      </Card>
    );
  };

  return (
    <>
      <PageHeader title="Incidents" subtitle="Every report is kept, with who acknowledged and signed it off. Reports can't be edited." />
      <h2 className="mb-2 font-semibold">Waiting for sign-off</h2>
      {!open.length && <Empty>Nothing waiting.</Empty>}
      <div className="space-y-3">{open.map(row)}</div>
      {done.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 font-semibold">Signed off</h2>
          <div className="space-y-3">{done.map(row)}</div>
        </>
      )}
    </>
  );
}
