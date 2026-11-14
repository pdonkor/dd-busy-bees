import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { BalanceLine, FeeAccount } from "@/components/fee-account";
import { SubmitButton } from "@/components/form-status";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { loadAccount } from "@/lib/account";
import { requireRole } from "@/lib/auth";
import { addDays, today } from "@/lib/dates";
import { formatGhs } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { addCharge, recordPayment, setChildPlans, voidInvoice, voidPayment, waiveFeeding } from "../actions";

export default async function ChildFeesPage({ params }: { params: Promise<{ childId: string }> }) {
  const user = await requireRole("owner", "admin");
  const isOwner = user.role === "owner";
  const { childId } = await params;
  const supabase = await createClient();
  const [{ data: child }, { data: plans }, account] = await Promise.all([
    supabase.from("children").select("id, first_name, last_name, fee_plan_id, feeding_plan_id").eq("id", childId).maybeSingle(),
    supabase.from("fee_plans").select("id, name, kind, amount_pesewas, active").order("name"),
    loadAccount(supabase, childId),
  ]);
  if (!child || !account) notFound();
  const of = (kind: string) => (plans ?? []).filter((p) => p.kind === kind && (p.active || p.id === child.fee_plan_id || p.id === child.feeding_plan_id));
  const date = today();

  return (
    <>
      <PageHeader
        title={`${child.first_name} ${child.last_name}: fees`}
        subtitle={undefined}
        action={
          <Link href={`/owner/children/${child.id}`} className="text-sm text-amber-800 underline">
            Child&apos;s profile
          </Link>
        }
      />
      <p className="mb-4 text-lg">
        <BalanceLine balance={account.balance} />
      </p>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <FeeAccount
          invoices={account.invoices}
          payments={account.payments}
          feeding={account.feeding}
          invoiceHref={(id) => `/owner/fees/invoice/${id}`}
          invoiceExtra={(inv) =>
            isOwner && !inv.voided_at ? (
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-stone-500">Void this invoice</summary>
                <ActionForm action={voidInvoice.bind(null, inv.id, child.id)} className="mt-1 flex flex-wrap gap-2">
                  <Input name="reason" placeholder="Reason" required maxLength={300} className="w-auto flex-1" />
                  <SubmitButton variant="danger">Void</SubmitButton>
                </ActionForm>
              </details>
            ) : null
          }
          paymentExtra={(p) =>
            isOwner && p.status === "success" ? (
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-stone-500">Void this payment</summary>
                <ActionForm action={voidPayment.bind(null, p.id, child.id)} className="mt-1 flex flex-wrap gap-2">
                  <Input name="reason" placeholder="Reason" required maxLength={300} className="w-auto flex-1" />
                  <SubmitButton variant="danger">Void</SubmitButton>
                </ActionForm>
              </details>
            ) : null
          }
          feedingExtra={(f) =>
            isOwner ? (
              <form action={waiveFeeding.bind(null, f.id, child.id)}>
                <button className="min-h-9 px-1 text-xs text-stone-500 underline">Waive</button>
              </form>
            ) : null
          }
        />
        <div className="space-y-4">
          <Card title="Record a payment">
            <ActionForm action={recordPayment.bind(null, child.id)}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount (GHS)">
                  <Input
                    name="amount"
                    inputMode="decimal"
                    required
                    defaultValue={account.balance > 0 ? (account.balance / 100).toFixed(2) : ""}
                  />
                </Field>
                <Field label="Date paid">
                  <Input name="paid_on" type="date" required defaultValue={date} max={date} />
                </Field>
              </div>
              <Field label="How">
                <Select name="method" defaultValue="cash">
                  <option value="cash">Cash</option>
                  <option value="bank">Bank transfer</option>
                  <option value="momo_direct">Mobile money to the school&apos;s number</option>
                </Select>
              </Field>
              <Field label="Note (optional)">
                <Input name="note" maxLength={300} placeholder="Receipt book number, bank reference…" />
              </Field>
              <SubmitButton>Record payment</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Add a charge">
            <ActionForm action={addCharge.bind(null, child.id)}>
              <Field label="Charge">
                <Select name="fee_plan_id" defaultValue="">
                  <option value="">Something else (type below)</option>
                  {of("one_off").map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatGhs(p.amount_pesewas)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Description (optional)">
                  <Input name="description" maxLength={200} placeholder="School trip" />
                </Field>
                <Field label="Amount (if not from list)">
                  <Input name="amount" inputMode="decimal" />
                </Field>
                <Field label="Quantity">
                  <Input name="quantity" type="number" min={1} max={100} defaultValue={1} />
                </Field>
                <Field label="Due">
                  <Input name="due_on" type="date" required defaultValue={addDays(date, 14)} />
                </Field>
              </div>
              <SubmitButton variant="secondary">Add charge</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Fee plan">
            <ActionForm action={setChildPlans.bind(null, child.id)} resetOnSuccess={false}>
              <Field label="Termly fee">
                <Select name="fee_plan_id" defaultValue={child.fee_plan_id ?? ""}>
                  <option value="">None (not invoiced each term)</option>
                  {of("termly").map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatGhs(p.amount_pesewas)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Feeding" hint="Charged automatically for each day the child is checked in.">
                <Select name="feeding_plan_id" defaultValue={child.feeding_plan_id ?? ""}>
                  <option value="">No school feeding</option>
                  {of("feeding").map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatGhs(p.amount_pesewas)} a day
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton variant="secondary">Save</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
