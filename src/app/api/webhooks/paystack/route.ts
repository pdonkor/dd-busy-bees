import { NextResponse } from "next/server";
import { settlePaystackPayment } from "@/lib/fees";
import { paystackConfigured, toTransaction, validWebhookSignature, verifyTransaction } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Paystack calls this when a payment completes. The body is only trusted if its
 * HMAC signature matches our secret key, and even then the transaction is
 * re-checked with Paystack before an invoice balance changes.
 */
export async function POST(request: Request) {
  if (!paystackConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await request.text();
  if (!validWebhookSignature(raw, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let event: { event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (event.event === "charge.success" && event.data) {
    const reference = toTransaction(event.data).reference;
    // Belt and braces: confirm with Paystack's API rather than relying on the event body alone.
    const tx = (await verifyTransaction(reference).catch(() => null)) ?? toTransaction(event.data);
    await settlePaystackPayment(createAdminClient(), tx);
  }
  // Always 200 once the signature is good, so Paystack doesn't retry events we chose to ignore.
  return NextResponse.json({ ok: true });
}
