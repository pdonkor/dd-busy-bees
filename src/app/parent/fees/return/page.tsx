import Link from "next/link";
import { Alert, Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { settlePaystackPayment } from "@/lib/fees";
import { formatGhs } from "@/lib/money";
import { verifyTransaction } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Paystack sends the parent back here. We ask Paystack directly how the payment
 * went (never trusting the URL), settle it if it succeeded, and show the result.
 * The webhook does the same in the background, whichever comes first.
 */
export default async function PaymentReturn({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  await requireRole("parent");
  const { reference } = await searchParams;
  const supabase = await createClient();
  // Read as the parent: only finds payments for their own children.
  const { data: payment } = reference
    ? await supabase.from("payments").select("id, amount_pesewas, status").eq("reference", reference).maybeSingle()
    : { data: null };

  let status = payment?.status;
  if (payment && status === "pending" && reference) {
    const tx = await verifyTransaction(reference).catch(() => null);
    if (tx) {
      await settlePaystackPayment(createAdminClient(), tx);
      const { data: again } = await supabase.from("payments").select("status").eq("id", payment.id).single();
      status = again?.status;
    }
  }

  return (
    <>
      <PageHeader title="Payment" />
      <Card>
        {!payment && <Alert>We couldn&apos;t find that payment.</Alert>}
        {payment && status === "success" && (
          <Alert kind="success">Thank you! {formatGhs(payment.amount_pesewas)} was received. A receipt is on its way by SMS.</Alert>
        )}
        {payment && status === "pending" && (
          <Alert kind="info">
            Your payment of {formatGhs(payment.amount_pesewas)} is still being confirmed. Mobile money can take a minute; this
            page will show it once Paystack confirms. You can safely leave.
          </Alert>
        )}
        {payment && status === "failed" && <Alert>The payment didn&apos;t go through. No money was taken. Please try again.</Alert>}
        <p className="mt-4 text-sm">
          <Link href="/parent/fees" className="text-amber-800 underline">
            Back to fees
          </Link>
        </p>
      </Card>
    </>
  );
}
