import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

// Paystack takes MTN MoMo, Telecel Cash, AirtelTigo Money and cards in cedis. Parents
// pay on Paystack's own page, so card numbers and MoMo PINs never reach this app.

const API = "https://api.paystack.co";

function secret(): string {
  const key = serverEnv().PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

export function paystackConfigured(): boolean {
  return !!serverEnv().PAYSTACK_SECRET_KEY;
}

export type PaystackTransaction = {
  status: string; // "success", "failed", "abandoned"…
  reference: string;
  amount: number; // pesewas
  currency: string;
  channel: string | null;
  paid_at: string | null;
};

export async function initializeTransaction(input: {
  email: string;
  amountPesewas: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}): Promise<string> {
  const res = await fetch(`${API}/transaction/initialize`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret()}`, "content-type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountPesewas,
      currency: "GHS",
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: ["mobile_money", "card"],
      metadata: input.metadata,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.status || !body.data?.authorization_url) {
    throw new Error(`Paystack initialize failed (${res.status}): ${body?.message ?? "no message"}`);
  }
  return body.data.authorization_url as string;
}

/** Asks Paystack directly (server to server) how a transaction ended. */
export async function verifyTransaction(reference: string): Promise<PaystackTransaction | null> {
  const res = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { authorization: `Bearer ${secret()}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.data ? toTransaction(body.data) : null;
}

export function toTransaction(data: Record<string, unknown>): PaystackTransaction {
  return {
    status: String(data.status ?? ""),
    reference: String(data.reference ?? ""),
    amount: Number(data.amount),
    currency: String(data.currency ?? ""),
    channel: data.channel ? String(data.channel) : null,
    paid_at: data.paid_at ? String(data.paid_at) : data.paidAt ? String(data.paidAt) : null,
  };
}

/** Webhooks are signed with an HMAC-SHA512 of the raw body using the secret key. */
export function validWebhookSignature(rawBody: string, signature: string | null, key = secret()): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha512", key).update(rawBody).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Paystack insists on an email address; parents who signed up by phone get a placeholder. */
export function payerEmail(profile: { email: string | null; phone: string | null; id: string }): string {
  if (profile.email) return profile.email;
  const local = profile.phone ? profile.phone.replace(/\D/g, "") : profile.id;
  return `${local}@${serverEnv().PAYSTACK_PLACEHOLDER_EMAIL_DOMAIN}`;
}
