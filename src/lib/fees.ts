import "server-only";
import { termInvoiceLines, type BillableChild } from "@/lib/billing";
import { formatGhs, paymentLabel } from "@/lib/money";
import { simpleEmail } from "@/lib/email";
import { serverEnv } from "@/lib/env";
import { sendBatch, sendEmailBatch } from "@/lib/notify";
import type { PaystackTransaction } from "@/lib/paystack";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;
type Admin = ReturnType<typeof createAdminClient>;

/**
 * Issues the termly invoice for every active child on a termly fee plan who doesn't
 * have one for this term yet. Safe to run twice: a unique rule allows one termly
 * invoice per child per term. Runs as the office user, or as the server for the
 * automatic start-of-term run (createdBy null).
 */
export async function generateTermInvoices(
  db: Db,
  schoolId: string,
  termId: string,
  createdBy: string | null,
): Promise<{ created: number; skipped: number }> {
  const [{ data: term }, { data: school }, { data: children }, { data: existing }] = await Promise.all([
    db.from("terms").select("id, name, fees_due_on").eq("id", termId).eq("school_id", schoolId).single(),
    db.from("schools").select("sibling_discount_percent").eq("id", schoolId).single(),
    db
      .from("children")
      .select("id, first_name, date_of_birth, fee_plans!children_fee_plan_id_fkey(name, amount_pesewas, active), guardians(parent_id)")
      .eq("school_id", schoolId)
      .eq("status", "active"),
    db.from("invoices").select("child_id").eq("term_id", termId).eq("kind", "termly").is("voided_at", null),
  ]);
  if (!term) throw new Error("term not found");
  const already = new Set((existing ?? []).map((i) => i.child_id));

  const billable: BillableChild[] = (children ?? []).map((c) => {
    const plan = c.fee_plans as unknown as { name: string; amount_pesewas: number; active: boolean } | null;
    return {
      id: c.id,
      first_name: c.first_name,
      date_of_birth: c.date_of_birth,
      plan: plan?.active ? { name: plan.name, amount_pesewas: plan.amount_pesewas } : null,
      parentIds: (c.guardians as { parent_id: string }[]).map((g) => g.parent_id),
    };
  });
  // Siblings are worked out across everyone, so a younger child invoiced later still gets the discount.
  const lines = termInvoiceLines(billable, term.name, school?.sibling_discount_percent ?? 0);

  let created = 0;
  let skipped = 0;
  for (const [childId, childLines] of lines) {
    if (already.has(childId)) {
      skipped++;
      continue;
    }
    const invoiceId = crypto.randomUUID();
    const { error } = await db.from("invoices").insert({
      id: invoiceId,
      school_id: schoolId,
      child_id: childId,
      term_id: term.id,
      kind: "termly",
      description: `School fees, ${term.name}`,
      due_on: term.fees_due_on,
      created_by: createdBy,
    });
    if (error) {
      skipped++;
      continue;
    }
    const { error: lineError } = await db
      .from("invoice_lines")
      .insert(childLines.map((l, position) => ({ ...l, position, invoice_id: invoiceId, school_id: schoolId })));
    if (lineError) {
      // Without lines the invoice is meaningless; void it so it can be reissued.
      await db.from("invoices").update({ voided_at: new Date().toISOString(), void_reason: "Lines failed to save" }).eq("id", invoiceId);
      skipped++;
      continue;
    }
    created++;
  }
  await db.from("terms").update({ invoices_generated_at: new Date().toISOString() }).eq("id", termId);
  return { created, skipped };
}

/**
 * Marks a Paystack payment as paid once Paystack itself says so (signed webhook or a
 * server-to-server verify), and only if the amount and currency match what we asked
 * for. Idempotent: whichever confirmation arrives second changes nothing.
 */
export async function settlePaystackPayment(admin: Admin, tx: PaystackTransaction): Promise<"settled" | "already" | "ignored"> {
  const { data: payment } = await admin
    .from("payments")
    .select("id, school_id, child_id, amount_pesewas, status, payer_id")
    .eq("reference", tx.reference)
    .eq("method", "paystack")
    .maybeSingle();
  if (!payment) return "ignored";
  if (payment.status !== "pending") return "already";

  if (tx.status !== "success") {
    if (["failed", "abandoned", "reversed"].includes(tx.status)) {
      await admin.from("payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
    }
    return "ignored";
  }
  if (tx.amount !== payment.amount_pesewas || tx.currency !== "GHS") {
    console.error("paystack amount mismatch", tx.reference, tx.amount, tx.currency);
    await admin
      .from("payments")
      .update({ status: "failed", note: `Amount mismatch: Paystack reported ${tx.amount} ${tx.currency}` })
      .eq("id", payment.id)
      .eq("status", "pending");
    return "ignored";
  }
  const { data: updated } = await admin
    .from("payments")
    .update({ status: "success", channel: tx.channel, paid_at: tx.paid_at ?? new Date().toISOString() })
    .eq("id", payment.id)
    .eq("status", "pending")
    .select("id");
  if (!updated?.length) return "already";
  await sendReceipt(admin, payment.id);
  return "settled";
}

/**
 * Thanks each parent of the child for a payment: by SMS to their phone, and by email
 * when they've given a receipt address. Each goes at most once per parent.
 */
export async function sendReceipt(admin: Admin, paymentId: string) {
  const { data: p } = await admin
    .from("payments")
    .select("id, school_id, child_id, amount_pesewas, method, channel, paid_at, children(first_name, last_name), schools(name)")
    .eq("id", paymentId)
    .single();
  if (!p) return;
  const [{ data: balance }, { data: guardians }] = await Promise.all([
    admin.from("child_balances").select("balance_pesewas").eq("child_id", p.child_id).single(),
    admin
      .from("guardians")
      .select("parent_id, profiles!inner(phone, receipt_email, active)")
      .eq("child_id", p.child_id)
      .eq("profiles.active", true),
  ]);
  const child = p.children as unknown as { first_name: string; last_name: string } | null;
  const name = child?.first_name ?? "your child";
  const school = (p.schools as unknown as { name: string } | null)?.name ?? "DD Busy Bees";
  const owed = Number(balance?.balance_pesewas ?? 0);
  const balanceText =
    owed > 0 ? `Balance now ${formatGhs(owed)}.` : owed < 0 ? `In credit ${formatGhs(-owed)}.` : "Fees fully paid.";
  const ref = p.id.slice(0, 8).toUpperCase();
  const message =
    `DD Busy Bees: received ${formatGhs(p.amount_pesewas)} for ${name} (${paymentLabel(p)}). ` +
    `${balanceText} Receipt ref ${ref}. Thank you!`;
  const parents = (guardians ?? []).map((g) => ({
    id: g.parent_id,
    ...(g.profiles as unknown as { phone: string | null; receipt_email: string | null }),
  }));

  await sendBatch(
    admin,
    parents
      .filter((g) => g.phone)
      .map((g) => ({
        schoolId: p.school_id,
        kind: "receipt",
        dedupeKey: `receipt:${p.id}:${g.id}`,
        to: g.phone!,
        message,
        recipientId: g.id,
        childId: p.child_id,
      })),
  );

  const emailed = parents.filter((g) => g.receipt_email);
  if (!emailed.length) return;
  const body = simpleEmail({
    school,
    heading: `Payment received: ${formatGhs(p.amount_pesewas)}`,
    paragraphs: [`Thank you. We've received your payment for ${name}.`, balanceText],
    rows: [
      ["Child", child ? `${child.first_name} ${child.last_name}` : name],
      ["Amount", formatGhs(p.amount_pesewas)],
      ["Paid by", paymentLabel(p)],
      ["Date", (p.paid_at ?? new Date().toISOString()).slice(0, 10)],
      ["Receipt ref", ref],
    ],
    button: { label: "See fees and receipts", url: `${serverEnv().APP_URL}/parent/fees` },
    footer: `${school}. You get this email because you asked for receipts by email in the app.`,
  });
  await sendEmailBatch(
    admin,
    emailed.map((g) => ({
      schoolId: p.school_id,
      kind: "receipt-email",
      dedupeKey: `receipt-email:${p.id}:${g.id}`,
      email: { to: g.receipt_email!, subject: `${school}: receipt ${ref} for ${name}`, ...body },
      recipientId: g.id,
      childId: p.child_id,
    })),
  );
}

/**
 * SMS reminders to parents of children who owe money on an invoice that is past its
 * due date. `period` goes into the dedupe key, so each family gets at most one
 * reminder per period (a week for the automatic run, a day when sent by hand).
 */
export async function sendFeeReminders(admin: Admin, schoolId: string, period: string, appUrl: string, date: string) {
  const [{ data: balances }, { data: overdue }] = await Promise.all([
    admin
      .from("child_balances")
      .select("child_id, balance_pesewas, first_name")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .gt("balance_pesewas", 0),
    admin.from("invoices").select("child_id").eq("school_id", schoolId).is("voided_at", null).lt("due_on", date),
  ]);
  const overdueChildren = new Set((overdue ?? []).map((i) => i.child_id));
  const owing = (balances ?? []).filter((b) => overdueChildren.has(b.child_id));
  if (!owing.length) return { sent: 0, skipped: 0, failed: 0 };
  const { data: guardians } = await admin
    .from("guardians")
    .select("child_id, parent_id, profiles!inner(phone, active)")
    .in("child_id", owing.map((b) => b.child_id))
    .eq("profiles.active", true)
    .not("profiles.phone", "is", null);
  return sendBatch(
    admin,
    owing.flatMap((b) => {
      const name = b.first_name as string;
      const message = `DD Busy Bees: ${name}'s fees balance is ${formatGhs(Number(b.balance_pesewas))}. Pay by mobile money or card at ${appUrl}/parent/fees or at the office. Thank you.`;
      return (guardians ?? [])
        .filter((g) => g.child_id === b.child_id)
        .map((g) => ({
          schoolId,
          kind: "fee_reminder",
          dedupeKey: `reminder:${b.child_id}:${g.parent_id}:${period}`,
          to: (g.profiles as unknown as { phone: string }).phone,
          message,
          recipientId: g.parent_id,
          childId: b.child_id,
        }));
    }),
  );
}
