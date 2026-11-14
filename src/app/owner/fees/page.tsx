import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDay, today } from "@/lib/dates";
import { formatGhs } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { generateInvoices, sendRemindersNow } from "./actions";

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole("owner", "admin");
  const { q = "" } = await searchParams;
  const supabase = await createClient();
  const date = today();
  const monthStart = `${date.slice(0, 7)}-01`;
  const [{ data: balances }, { data: classList }, { data: terms }, { data: monthPayments }] = await Promise.all([
    supabase
      .from("child_balances")
      .select("child_id, balance_pesewas, first_name, last_name, status, fee_plan_id, class_id")
      .order("balance_pesewas", { ascending: false }),
    supabase.from("classes").select("id, name"),
    supabase.from("terms").select("id, name, starts_on, ends_on, fees_due_on, invoices_generated_at").order("starts_on", { ascending: false }).limit(6),
    supabase.from("payments").select("amount_pesewas").eq("status", "success").gte("paid_at", `${monthStart}T00:00:00Z`),
  ]);
  const className = new Map((classList ?? []).map((c) => [c.id, c.name]));
  const rows = (balances ?? [])
    .map((b) => ({
      child_id: b.child_id as string,
      balance_pesewas: Number(b.balance_pesewas),
      children: {
        first_name: b.first_name as string,
        last_name: b.last_name as string,
        status: b.status as string,
        fee_plan_id: b.fee_plan_id as string | null,
        classes: b.class_id ? { name: className.get(b.class_id) ?? "" } : null,
      },
    }))
    .filter(
    (r) =>
      (r.children.status === "active" || Number(r.balance_pesewas) !== 0) &&
      `${r.children.first_name} ${r.children.last_name}`.toLowerCase().includes(q.toLowerCase()),
  );
  const outstanding = rows.reduce((s, r) => s + Math.max(0, Number(r.balance_pesewas)), 0);
  const owing = rows.filter((r) => Number(r.balance_pesewas) > 0).length;
  const collected = (monthPayments ?? []).reduce((s, p) => s + p.amount_pesewas, 0);
  const noPlan = rows.filter((r) => r.children.status === "active" && !r.children.fee_plan_id).length;
  const current = (terms ?? []).find((t) => t.starts_on <= date && t.ends_on >= date);
  const next = [...(terms ?? [])].reverse().find((t) => t.starts_on > date);

  return (
    <>
      <PageHeader
        title="Fees"
        subtitle="Balances, invoices and payments. Parents pay by mobile money or card in the app."
        action={
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/owner/fees/setup" className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-medium">
              Fee plans and terms
            </Link>
            <Link href="/owner/fees/reports" className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-medium">
              Reports and export
            </Link>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-semibold">{formatGhs(outstanding)}</p>
          <p className="text-sm text-stone-600">Owed by {owing} {owing === 1 ? "child" : "children"}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-semibold">{formatGhs(collected)}</p>
          <p className="text-sm text-stone-600">Collected this month</p>
        </div>
        <div className="col-span-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm md:col-span-1">
          <p className="text-sm font-medium">{current ? current.name : "Between terms"}</p>
          <p className="text-sm text-stone-600">
            {current
              ? `Fees due ${formatDay(current.fees_due_on)}`
              : next
                ? `${next.name} starts ${formatDay(next.starts_on)}`
                : "No upcoming term set"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="Balances">
          <form className="mb-3">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by name"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </form>
          {!rows.length && <Empty>No children yet.</Empty>}
          <ul className="divide-y divide-stone-100 text-sm">
            {rows.map((r) => {
              const bal = Number(r.balance_pesewas);
              return (
                <li key={r.child_id}>
                  <Link href={`/owner/fees/${r.child_id}`} className="flex items-center justify-between gap-2 py-2 hover:bg-stone-50">
                    <span>
                      {r.children.first_name} {r.children.last_name}
                      <span className="text-stone-500"> · {r.children.classes?.name ?? "no class"}</span>
                      {r.children.status === "active" && !r.children.fee_plan_id && (
                        <span className="ml-2 rounded-full bg-stone-100 px-2 text-xs text-stone-600">no fee plan</span>
                      )}
                    </span>
                    <span className={bal > 0 ? "font-medium text-red-800" : bal < 0 ? "text-green-800" : "text-stone-500"}>
                      {bal > 0 ? formatGhs(bal) : bal < 0 ? `${formatGhs(-bal)} credit` : "Paid up"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card title="Reminders">
            <p className="mb-3 text-sm text-stone-600">
              Parents with an overdue balance get an SMS reminder automatically every Monday. You can also send one now.
            </p>
            <ActionForm action={sendRemindersNow}>
              <SubmitButton variant="secondary" pendingText="Sending…">
                Send reminders now
              </SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Termly invoices">
            {noPlan > 0 && (
              <p className="mb-2 text-sm text-amber-800">
                {noPlan} active {noPlan === 1 ? "child has" : "children have"} no fee plan and won&apos;t be invoiced.
              </p>
            )}
            {!terms?.length && (
              <Empty>
                <Link href="/owner/fees/setup" className="underline">
                  Add your terms
                </Link>{" "}
                to issue termly invoices.
              </Empty>
            )}
            <ul className="space-y-3 text-sm">
              {terms?.map((t) => (
                <li key={t.id}>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-stone-600">
                    {formatDay(t.starts_on)} – {formatDay(t.ends_on)}
                    {t.invoices_generated_at ? " · invoices issued" : ""}
                  </p>
                  <ActionForm action={generateInvoices.bind(null, t.id)} className="mt-1">
                    <SubmitButton variant="secondary" pendingText="Issuing…">
                      {t.invoices_generated_at ? "Invoice children added since" : "Issue invoices now"}
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
