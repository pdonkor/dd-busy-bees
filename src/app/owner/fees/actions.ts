"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstIssue, type ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { today } from "@/lib/dates";
import { serverEnv } from "@/lib/env";
import { generateTermInvoices, sendFeeReminders, sendReceipt } from "@/lib/fees";
import { parseGhs } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Runs as the logged-in owner or admin; row-level security and the database
// guards decide again who may set fees, issue invoices and void records.

const uuid = z.string().uuid();
const FAILED = "That didn't save. Please try again.";
const amount = z.string().transform((v, ctx) => {
  const p = parseGhs(v);
  if (p === null) {
    ctx.addIssue({ code: "custom", message: "Enter an amount in cedis, for example 1500 or 12.50." });
    return z.NEVER;
  }
  return p;
});
const form = (fd: FormData) => Object.fromEntries(fd.entries()) as Record<string, string>;

function refresh(childId?: string) {
  revalidatePath("/owner/fees", "layout");
  if (childId) revalidatePath(`/owner/fees/${childId}`);
}

// Fee plans, terms and the sibling discount (owner only) ------------------------------

const planSchema = z.object({
  name: z.string().trim().min(1, "Give the fee a name.").max(80),
  kind: z.enum(["termly", "one_off", "feeding"]),
  amount,
});

export async function createFeePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner");
  const parsed = planSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("fee_plans")
    .insert({ school_id: user.schoolId, name: parsed.data.name, kind: parsed.data.kind, amount_pesewas: parsed.data.amount });
  if (error) return { error: FAILED };
  refresh();
  return { success: `Added ${parsed.data.name}.` };
}

export async function updateFeePlan(planId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("owner");
  const parsed = planSchema.omit({ kind: true }).safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  // Changing a fee affects future invoices and feeding days only; issued invoices keep their amounts.
  const { error } = await supabase
    .from("fee_plans")
    .update({ name: parsed.data.name, amount_pesewas: parsed.data.amount })
    .eq("id", uuid.parse(planId));
  if (error) return { error: FAILED };
  refresh();
  return { success: "Saved. New invoices and feeding days use the new amount." };
}

export async function setFeePlanActive(planId: string, active: boolean) {
  await requireRole("owner");
  const supabase = await createClient();
  await supabase.from("fee_plans").update({ active }).eq("id", uuid.parse(planId));
  refresh();
}

export async function setSiblingDiscount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner");
  const pct = z.coerce.number().int().min(0).max(100).safeParse(formData.get("percent"));
  if (!pct.success) return { error: "Enter a whole number from 0 to 100." };
  const supabase = await createClient();
  const { error } = await supabase.from("schools").update({ sibling_discount_percent: pct.data }).eq("id", user.schoolId);
  if (error) return { error: FAILED };
  refresh();
  return { success: pct.data ? `Younger siblings get ${pct.data}% off the termly fee.` : "Sibling discount switched off." };
}

const termSchema = z
  .object({
    name: z.string().trim().min(1, "Name the term, for example Term 1 2027.").max(60),
    starts_on: z.string().date("Enter the first day of term."),
    ends_on: z.string().date("Enter the last day of term."),
    fees_due_on: z.string().date("Enter the date fees are due."),
  })
  .refine((t) => t.ends_on > t.starts_on, { message: "The term must end after it starts." });

export async function createTerm(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = termSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("terms").insert({ ...parsed.data, school_id: user.schoolId });
  if (error) return { error: error.code === "23505" ? "A term already starts on that date." : FAILED };
  refresh();
  return { success: `Added ${parsed.data.name}. Its invoices are issued automatically on the first day of term.` };
}

export async function generateInvoices(termId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const supabase = await createClient();
  try {
    const { created, skipped } = await generateTermInvoices(supabase, user.schoolId, uuid.parse(termId), user.id);
    refresh();
    return { success: `Issued ${created} ${created === 1 ? "invoice" : "invoices"}${skipped ? ` (${skipped} already had one)` : ""}.` };
  } catch {
    return { error: FAILED };
  }
}

// A child's account ---------------------------------------------------------------------

export async function setChildPlans(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("owner", "admin");
  const optional = z
    .string()
    .transform((v) => v || null)
    .pipe(uuid.nullable());
  const parsed = z
    .object({ fee_plan_id: optional, feeding_plan_id: optional })
    .safeParse({ fee_plan_id: formData.get("fee_plan_id") ?? "", feeding_plan_id: formData.get("feeding_plan_id") ?? "" });
  if (!parsed.success) return { error: "Please choose from the list." };
  const supabase = await createClient();
  const { error } = await supabase.from("children").update(parsed.data).eq("id", uuid.parse(childId));
  if (error) return { error: FAILED };
  refresh(childId);
  return { success: "Saved." };
}

const chargeSchema = z.object({
  fee_plan_id: z.string().optional(),
  description: z.string().trim().max(200).optional(),
  amount: z.string().optional(),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
  due_on: z.string().date("Enter a due date."),
});

/** Adds a one-off charge (uniform, books, an outing…) as its own invoice. */
export async function addCharge(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = chargeSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { fee_plan_id, quantity, due_on } = parsed.data;
  const supabase = await createClient();

  let description = parsed.data.description ?? "";
  let unit: number | null = null;
  if (fee_plan_id) {
    const { data: plan } = await supabase
      .from("fee_plans")
      .select("name, amount_pesewas")
      .eq("id", uuid.parse(fee_plan_id))
      .eq("kind", "one_off")
      .single();
    if (!plan) return { error: "Please choose a charge from the list." };
    description = description || plan.name;
    unit = plan.amount_pesewas;
  } else {
    unit = parseGhs(parsed.data.amount ?? "");
    if (!description) return { error: "Describe the charge, for example School trip." };
    if (unit === null) return { error: "Enter an amount in cedis." };
  }

  const invoiceId = crypto.randomUUID();
  const { error } = await supabase.from("invoices").insert({
    id: invoiceId,
    school_id: user.schoolId,
    child_id: uuid.parse(childId),
    kind: "one_off",
    description,
    due_on,
    created_by: user.id,
  });
  if (error) return { error: FAILED };
  const { error: lineError } = await supabase
    .from("invoice_lines")
    .insert({ invoice_id: invoiceId, school_id: user.schoolId, description, quantity, unit_pesewas: unit });
  if (lineError) return { error: "The invoice was created without its amount. Ask the owner to void it and try again." };
  refresh(childId);
  return { success: `Charged ${description}.` };
}

const paymentSchema = z.object({
  amount,
  method: z.enum(["cash", "bank", "momo_direct"]),
  paid_on: z.string().date("Enter the date it was paid."),
  note: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
});

/** Records cash, a bank transfer or MoMo paid straight to the school, and sends the receipt SMS. */
export async function recordPayment(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = paymentSchema.safeParse(form(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (parsed.data.paid_on > today()) return { error: "The payment date can't be in the future." };
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("payments").insert({
    id,
    school_id: user.schoolId,
    child_id: uuid.parse(childId),
    amount_pesewas: parsed.data.amount,
    method: parsed.data.method,
    status: "success",
    paid_at: `${parsed.data.paid_on}T12:00:00Z`,
    recorded_by: user.id,
    note: parsed.data.note,
  });
  if (error) return { error: FAILED };
  let receipt = "Receipt sent by SMS.";
  try {
    await sendReceipt(createAdminClient(), id);
  } catch {
    receipt = "The receipt SMS didn't send.";
  }
  refresh(childId);
  return { success: `Payment recorded. ${receipt}` };
}

const reason = z.string().trim().min(3, "Give a reason.").max(300);

export async function voidInvoice(invoiceId: string, childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("owner");
  const r = reason.safeParse(formData.get("reason"));
  if (!r.success) return { error: firstIssue(r.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ voided_at: new Date().toISOString(), void_reason: r.data })
    .eq("id", uuid.parse(invoiceId));
  if (error) return { error: FAILED };
  refresh(childId);
  return { success: "Invoice voided." };
}

export async function voidPayment(paymentId: string, childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("owner");
  const r = reason.safeParse(formData.get("reason"));
  if (!r.success) return { error: firstIssue(r.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("payments")
    .update({ status: "void", void_reason: r.data })
    .eq("id", uuid.parse(paymentId));
  if (error) return { error: FAILED };
  refresh(childId);
  return { success: "Payment voided." };
}

export async function waiveFeeding(chargeId: string, childId: string) {
  await requireRole("owner");
  const supabase = await createClient();
  await supabase.from("feeding_charges").delete().eq("id", uuid.parse(chargeId));
  refresh(childId);
}

export async function sendRemindersNow(_prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const date = today();
  try {
    const { sent, skipped } = await sendFeeReminders(createAdminClient(), user.schoolId, `manual:${date}`, serverEnv().APP_URL, date);
    return {
      success: sent
        ? `Sent ${sent} reminder ${sent === 1 ? "SMS" : "SMSes"}${skipped ? ` (${skipped} already reminded today)` : ""}.`
        : skipped
          ? "Everyone with an overdue balance has already been reminded today."
          : "Nobody has an overdue balance.",
    };
  } catch {
    return { error: "Reminders didn't send. Please try again." };
  }
}
