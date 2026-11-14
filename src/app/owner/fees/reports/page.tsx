import { Card, Field, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { addDays, today } from "@/lib/dates";
import { formatGhs, paymentLabel } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const MONTHS_BACK = 6;

export default async function FeeReportsPage() {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  const date = today();
  const start = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - (MONTHS_BACK - 1));
  const since = start.toISOString().slice(0, 10);

  const [{ data: payments }, { data: invoices }, { data: feeding }] = await Promise.all([
    supabase.from("payments").select("amount_pesewas, method, channel, paid_at").eq("status", "success").gte("paid_at", `${since}T00:00:00Z`),
    supabase.from("invoices").select("issued_on, invoice_lines(amount_pesewas)").is("voided_at", null).gte("issued_on", since),
    supabase.from("feeding_charges").select("date, amount_pesewas").gte("date", since),
  ]);

  const months = Array.from({ length: MONTHS_BACK }, (_, i) => {
    const d = new Date(start);
    d.setUTCMonth(start.getUTCMonth() + i);
    return d.toISOString().slice(0, 7);
  }).reverse();
  const sum = <T,>(list: T[] | null, month: string, dateOf: (x: T) => string, amount: (x: T) => number) =>
    (list ?? []).filter((x) => dateOf(x).startsWith(month)).reduce((s, x) => s + amount(x), 0);

  const byMethod = new Map<string, number>();
  for (const p of payments ?? []) {
    if (!p.paid_at?.startsWith(date.slice(0, 7))) continue;
    const label = paymentLabel(p);
    byMethod.set(label, (byMethod.get(label) ?? 0) + p.amount_pesewas);
  }

  return (
    <>
      <PageHeader title="Fee reports" subtitle="Income and charges by month, and CSV files for the accountant." />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title="By month">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-600">
                <th className="py-2 font-medium">Month</th>
                <th className="py-2 text-right font-medium">Invoiced</th>
                <th className="py-2 text-right font-medium">Feeding</th>
                <th className="py-2 text-right font-medium">Collected</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m} className="border-b border-stone-100">
                  <td className="py-2">
                    {new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
                  </td>
                  <td className="py-2 text-right">
                    {formatGhs(
                      sum(invoices, m, (i) => i.issued_on, (i) =>
                        (i.invoice_lines as { amount_pesewas: number }[]).reduce((s, l) => s + l.amount_pesewas, 0),
                      ),
                    )}
                  </td>
                  <td className="py-2 text-right">{formatGhs(sum(feeding, m, (f) => f.date, (f) => f.amount_pesewas))}</td>
                  <td className="py-2 text-right font-medium">
                    {formatGhs(sum(payments, m, (p) => p.paid_at ?? "", (p) => p.amount_pesewas))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="space-y-4">
          <Card title="This month by method">
            {!byMethod.size && <p className="text-sm text-stone-500">No payments yet this month.</p>}
            <ul className="text-sm">
              {[...byMethod].map(([label, amount]) => (
                <li key={label} className="flex justify-between py-1">
                  <span>{label}</span>
                  <span>{formatGhs(amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Download CSV">
            <form action="/owner/fees/export" method="get" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="From">
                  <Input name="from" type="date" defaultValue={addDays(date, -90)} />
                </Field>
                <Field label="To">
                  <Input name="to" type="date" defaultValue={date} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ["payments", "Payments"],
                  ["invoices", "Invoices"],
                ].map(([kind, label]) => (
                  <button
                    key={kind}
                    name="kind"
                    value={kind}
                    className="min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </form>
            <form action="/owner/fees/export" method="get" className="mt-3">
              <input type="hidden" name="kind" value="balances" />
              <button className="min-h-10 text-sm text-amber-800 underline">Download everyone&apos;s current balance</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
