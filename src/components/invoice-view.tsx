import { notFound } from "next/navigation";
import { invoiceNumber } from "@/lib/account";
import { formatDay } from "@/lib/dates";
import { formatGhs } from "@/lib/money";
import type { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** A printable invoice. Read as the logged-in user, so parents only open their own children's. */
export async function InvoiceView({ supabase, id }: { supabase: Supabase; id: string }) {
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, number, description, issued_on, due_on, voided_at, void_reason, children(first_name, last_name), invoice_lines(id, description, quantity, unit_pesewas, amount_pesewas, position)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!inv) notFound();
  const { data: school } = await supabase.from("schools").select("name, address").single();
  const child = inv.children as unknown as { first_name: string; last_name: string } | null;
  const lines = [...(inv.invoice_lines as { id: string; description: string; quantity: number; unit_pesewas: number; amount_pesewas: number; position: number }[])].sort(
    (a, b) => a.position - b.position,
  );
  const total = lines.reduce((s, l) => s + l.amount_pesewas, 0);

  return (
    <article className="mx-auto max-w-2xl rounded-xl border border-stone-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-xl font-semibold text-amber-700">{school?.name ?? "DD Busy Bees"}</p>
          {school?.address && <p className="text-sm text-stone-600">{school.address}</p>}
        </div>
        <div className="text-right text-sm">
          <p className="text-lg font-semibold">{inv.voided_at ? "VOID INVOICE" : "Invoice"}</p>
          <p>{invoiceNumber(inv.number)}</p>
          <p>Issued {formatDay(inv.issued_on)}</p>
          <p>Due {formatDay(inv.due_on)}</p>
        </div>
      </div>
      <p className="mt-6 text-sm">
        For <span className="font-medium">{child ? `${child.first_name} ${child.last_name}` : ""}</span>: {inv.description}
      </p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-stone-600">
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Each</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-stone-100">
              <td className="py-2">{l.description}</td>
              <td className="py-2 text-right">{l.quantity}</td>
              <td className="py-2 text-right">{formatGhs(l.unit_pesewas)}</td>
              <td className="py-2 text-right">{formatGhs(l.amount_pesewas)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="py-2 text-right font-semibold">
              Total
            </td>
            <td className="py-2 text-right font-semibold">{formatGhs(total)}</td>
          </tr>
        </tfoot>
      </table>
      {inv.voided_at && <p className="mt-4 text-sm text-red-800">This invoice was voided: {inv.void_reason}</p>}
      <p className="mt-6 text-xs text-stone-500">
        Pay by mobile money or card in the DD Busy Bees app, or by cash or bank transfer at the school office.
      </p>
      <div className="mt-4 print:hidden">
        <PrintButton />
      </div>
    </article>
  );
}
