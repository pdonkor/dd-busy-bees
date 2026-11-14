import { ActionForm } from "@/components/action-form";
import { BalanceLine, FeeAccount } from "@/components/fee-account";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, Field, Input, PageHeader } from "@/components/ui";
import { loadAccount } from "@/lib/account";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startPayment } from "./actions";

export default async function ParentFeesPage() {
  await requireRole("parent");
  const supabase = await createClient();
  // Row-level security returns only this parent's own children and their accounts.
  const { data: children } = await supabase.from("children").select("id, first_name, last_name").order("first_name");
  const accounts = await Promise.all((children ?? []).map(async (c) => ({ child: c, account: await loadAccount(supabase, c.id) })));

  return (
    <>
      <PageHeader title="Fees" subtitle="Pay school fees, uniform and feeding by mobile money or card." />
      {!accounts.length && <Empty>No children are linked to your account yet.</Empty>}
      <div className="space-y-8">
        {accounts.map(({ child, account }) =>
          account ? (
            <section key={child.id}>
              <h2 className="mb-2 text-lg font-semibold">
                {child.first_name} {child.last_name} · <BalanceLine balance={account.balance} />
              </h2>
              <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
                <Card title="Pay now">
                  <ActionForm action={startPayment.bind(null, child.id)} resetOnSuccess={false}>
                    <Field label="Amount (GHS)" hint="Pay in full or part. MTN MoMo, Telecel Cash, AirtelTigo Money or card.">
                      <Input
                        name="amount"
                        inputMode="decimal"
                        required
                        defaultValue={account.balance > 0 ? (account.balance / 100).toFixed(2) : ""}
                        placeholder="e.g. 500"
                      />
                    </Field>
                    <SubmitButton pendingText="Opening Paystack…">Pay with mobile money or card</SubmitButton>
                    <p className="text-xs text-stone-500">
                      You&apos;ll go to Paystack&apos;s secure page. The school never sees your card number or MoMo PIN.
                    </p>
                  </ActionForm>
                </Card>
                <FeeAccount
                  invoices={account.invoices}
                  payments={account.payments}
                  feeding={account.feeding}
                  invoiceHref={(id) => `/parent/fees/invoice/${id}`}
                />
              </div>
            </section>
          ) : null,
        )}
      </div>
    </>
  );
}
