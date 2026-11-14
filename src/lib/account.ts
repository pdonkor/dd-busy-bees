import "server-only";
import { allocatePayments } from "@/lib/billing";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AccountInvoice = {
  id: string;
  number: number;
  kind: string;
  description: string;
  issued_on: string;
  due_on: string;
  voided_at: string | null;
  void_reason: string | null;
  total: number;
  paid: number;
  outstanding: number;
};

export type AccountPayment = {
  id: string;
  amount_pesewas: number;
  method: string;
  channel: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  note: string | null;
  void_reason: string | null;
};

/**
 * Everything on one child's fee account, read as the logged-in user (so a parent
 * only ever gets their own child's account, and a teacher gets nothing).
 */
export async function loadAccount(supabase: Supabase, childId: string) {
  const [{ data: balance }, { data: invoices }, { data: payments }, { data: feeding }] = await Promise.all([
    supabase.from("child_balances").select("*").eq("child_id", childId).maybeSingle(),
    supabase
      .from("invoices")
      .select("id, number, kind, description, issued_on, due_on, voided_at, void_reason, invoice_lines(amount_pesewas)")
      .eq("child_id", childId)
      .order("issued_on", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount_pesewas, method, channel, status, paid_at, created_at, note, void_reason")
      .eq("child_id", childId)
      .in("status", ["success", "void", "pending"])
      .order("created_at", { ascending: false }),
    supabase
      .from("feeding_charges")
      .select("id, date, amount_pesewas")
      .eq("child_id", childId)
      .order("date", { ascending: false })
      .limit(60),
  ]);
  if (!balance) return null;
  const withTotals = (invoices ?? []).map((i) => ({
    ...i,
    total: (i.invoice_lines as { amount_pesewas: number }[]).reduce((s, l) => s + l.amount_pesewas, 0),
  }));
  const allocation = allocatePayments(
    withTotals.filter((i) => !i.voided_at),
    Number(balance.paid_pesewas),
    Number(balance.feeding_pesewas),
  );
  const accountInvoices: AccountInvoice[] = withTotals.map((i) => ({
    id: i.id,
    number: i.number,
    kind: i.kind,
    description: i.description,
    issued_on: i.issued_on,
    due_on: i.due_on,
    voided_at: i.voided_at,
    void_reason: i.void_reason,
    total: i.total,
    paid: allocation.get(i.id)?.paid ?? 0,
    outstanding: i.voided_at ? 0 : (allocation.get(i.id)?.outstanding ?? i.total),
  }));
  return {
    balance: Number(balance.balance_pesewas),
    invoicedTotal: Number(balance.invoiced_pesewas),
    feedingTotal: Number(balance.feeding_pesewas),
    paidTotal: Number(balance.paid_pesewas),
    invoices: accountInvoices,
    payments: (payments ?? []) as AccountPayment[],
    feeding: feeding ?? [],
  };
}

export const invoiceNumber = (n: number) => `INV-${String(n).padStart(5, "0")}`;
