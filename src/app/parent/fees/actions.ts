"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { parseGhs } from "@/lib/money";
import { initializeTransaction, payerEmail, paystackConfigured } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MIN_PAYMENT = 100; // GHS 1
// A typo guard: far above any term's fees, so an extra zero is caught before Paystack.
const MAX_PAYMENT = 5_000_000; // GHS 50,000

/**
 * Starts a Paystack payment for one child's account and sends the parent to
 * Paystack's page. Nothing is marked paid here: that only happens when Paystack
 * confirms (see the webhook and the return page).
 */
export async function startPayment(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("parent");
  const id = z.string().uuid().parse(childId);
  const amount = parseGhs(String(formData.get("amount") ?? ""));
  if (amount === null || amount < MIN_PAYMENT) return { error: "Enter an amount of at least GHS 1." };
  if (amount > MAX_PAYMENT) return { error: "That amount is too large to pay online. Please check it, or pay at the office." };
  if (!paystackConfigured()) return { error: "Online payment isn't switched on yet. Please pay at the school office." };

  // Row-level security: this only finds the child if they are this parent's own.
  const supabase = await createClient();
  const [{ data: child }, { data: profile }] = await Promise.all([
    supabase.from("children").select("id, first_name").eq("id", id).maybeSingle(),
    supabase.from("profiles").select("id, email, phone, receipt_email").eq("id", user.id).single(),
  ]);
  if (!child || !profile) return { error: "That child isn't linked to your account." };

  const reference = `bb_${crypto.randomUUID().replace(/-/g, "")}`;
  const admin = createAdminClient();
  const { error } = await admin.from("payments").insert({
    school_id: user.schoolId,
    child_id: child.id,
    amount_pesewas: amount,
    method: "paystack",
    status: "pending",
    reference,
    payer_id: user.id,
  });
  if (error) return { error: "Couldn't start the payment. Please try again." };

  let url: string;
  try {
    url = await initializeTransaction({
      // Paystack emails its own receipt too, so use the parent's receipt address when they gave one.
      email: payerEmail({ ...profile, email: profile.receipt_email ?? profile.email }),
      amountPesewas: amount,
      reference,
      callbackUrl: `${serverEnv().APP_URL}/parent/fees/return`,
      metadata: { child_id: child.id, parent_id: user.id, child_name: child.first_name },
    });
  } catch (e) {
    console.error(e);
    await admin.from("payments").update({ status: "failed" }).eq("reference", reference);
    return { error: "Couldn't reach the payment service. Please try again in a few minutes." };
  }
  redirect(url);
}
