import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { invoiceNumber, type AccountInvoice, type AccountPayment } from "@/lib/account";
import { formatDay, today } from "@/lib/dates";
import { formatGhs, paymentLabel } from "@/lib/money";

export function BalanceLine({ balance }: { balance: number }) {
  if (balance > 0) return <span className="font-semibold text-red-800">Owes {formatGhs(balance)}</span>;
  if (balance < 0) return <span className="font-semibold text-green-800">In credit {formatGhs(-balance)}</span>;
  return <span className="font-semibold text-green-800">Fully paid</span>;
}

/** A child's invoices, payments and feeding days. Used on the owner and parent fee screens. */
export function FeeAccount({
  invoices,
  payments,
  feeding,
  invoiceHref,
  invoiceExtra,
  paymentExtra,
  feedingExtra,
}: {
  invoices: AccountInvoice[];
  payments: AccountPayment[];
  feeding: { id: string; date: string; amount_pesewas: number }[];
  invoiceHref: (id: string) => string;
  invoiceExtra?: (inv: AccountInvoice) => ReactNode;
  paymentExtra?: (p: AccountPayment) => ReactNode;
  feedingExtra?: (f: { id: string }) => ReactNode;
}) {
  const date = today();
  const month = date.slice(0, 7);
  const feedingThisMonth = feeding.filter((f) => f.date.startsWith(month));
  return (
    <div className="space-y-4">
      <Card title="Invoices">
        {!invoices.length && <p className="text-sm text-stone-500">No invoices yet.</p>}
        <ul className="divide-y divide-stone-100 text-sm">
          {invoices.map((inv) => (
            <li key={inv.id} className="py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={invoiceHref(inv.id)} className={`font-medium underline ${inv.voided_at ? "text-stone-400 line-through" : ""}`}>
                    {inv.description}
                  </Link>
                  <p className="text-xs text-stone-500">
                    {invoiceNumber(inv.number)} · issued {formatDay(inv.issued_on)} · due {formatDay(inv.due_on)}
                  </p>
                  {inv.voided_at && <p className="text-xs text-stone-500">Void: {inv.void_reason}</p>}
                </div>
                <div className="text-right">
                  <p>{formatGhs(inv.total)}</p>
                  {!inv.voided_at && (
                    <p
                      className={`text-xs ${
                        inv.outstanding <= 0 ? "text-green-700" : inv.due_on < date ? "text-red-700" : "text-stone-600"
                      }`}
                    >
                      {inv.outstanding <= 0
                        ? "Paid"
                        : inv.paid > 0
                          ? `${formatGhs(inv.outstanding)} left`
                          : inv.due_on < date
                            ? "Overdue"
                            : "Unpaid"}
                    </p>
                  )}
                </div>
              </div>
              {invoiceExtra?.(inv)}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Payments">
        {!payments.length && <p className="text-sm text-stone-500">No payments yet.</p>}
        <ul className="divide-y divide-stone-100 text-sm">
          {payments.map((p) => (
            <li key={p.id} className="py-2">
              <div className="flex flex-wrap justify-between gap-2">
                <span className={p.status === "void" ? "text-stone-400 line-through" : ""}>
                  {formatDay((p.paid_at ?? p.created_at).slice(0, 10))} · {paymentLabel(p)}
                  {p.status === "pending" && <span className="ml-1 text-amber-700">(waiting for confirmation)</span>}
                </span>
                <span className={p.status === "success" ? "text-green-800" : "text-stone-500"}>{formatGhs(p.amount_pesewas)}</span>
              </div>
              {p.note && <p className="text-xs text-stone-500">{p.note}</p>}
              {p.status === "void" && <p className="text-xs text-stone-500">Void: {p.void_reason}</p>}
              {paymentExtra?.(p)}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Feeding">
        <p className="mb-2 text-sm text-stone-600">
          Charged for each day at school. This month: {feedingThisMonth.length}{" "}
          {feedingThisMonth.length === 1 ? "day" : "days"},{" "}
          {formatGhs(feedingThisMonth.reduce((s, f) => s + f.amount_pesewas, 0))}.
        </p>
        {feeding.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-stone-600">Show days</summary>
            <ul className="mt-1 divide-y divide-stone-100">
              {feeding.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-1">
                  <span>{formatDay(f.date)}</span>
                  <span className="flex items-center gap-2">
                    {formatGhs(f.amount_pesewas)}
                    {feedingExtra?.(f)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </div>
  );
}
