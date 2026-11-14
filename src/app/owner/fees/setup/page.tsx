import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { formatGhs } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { createFeePlan, createTerm, setFeePlanActive, setSiblingDiscount, updateFeePlan } from "../actions";

const KIND_LABEL = { termly: "Termly fee", one_off: "One-off charge", feeding: "Feeding (per day attended)" } as const;
type Kind = keyof typeof KIND_LABEL;

export default async function FeeSetupPage() {
  const user = await requireRole("owner", "admin");
  const isOwner = user.role === "owner";
  const supabase = await createClient();
  const [{ data: plans }, { data: terms }, { data: school }] = await Promise.all([
    supabase.from("fee_plans").select("id, name, kind, amount_pesewas, active").order("kind").order("name"),
    supabase.from("terms").select("id, name, starts_on, ends_on, fees_due_on").order("starts_on", { ascending: false }),
    supabase.from("schools").select("sibling_discount_percent").single(),
  ]);

  return (
    <>
      <PageHeader
        title="Fee plans and terms"
        subtitle={isOwner ? "Set what the school charges, in cedis." : "Only the owner can change fees. You can add terms."}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Fees">
          {(["termly", "one_off", "feeding"] as Kind[]).map((kind) => {
            const list = (plans ?? []).filter((p) => p.kind === kind);
            return (
              <div key={kind} className="mb-4">
                <h3 className="mb-1 text-sm font-semibold text-stone-800">{KIND_LABEL[kind]}</h3>
                {!list.length && <p className="text-sm text-stone-500">None yet.</p>}
                <ul className="divide-y divide-stone-100 text-sm">
                  {list.map((p) => (
                    <li key={p.id} className="py-2">
                      {isOwner ? (
                        <details>
                          <summary className="flex cursor-pointer items-center justify-between gap-2">
                            <span className={p.active ? "" : "text-stone-400 line-through"}>{p.name}</span>
                            <span>{formatGhs(p.amount_pesewas)}</span>
                          </summary>
                          <ActionForm action={updateFeePlan.bind(null, p.id)} resetOnSuccess={false} className="mt-2 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <Input name="name" defaultValue={p.name} required maxLength={80} aria-label="Name" />
                              <Input name="amount" defaultValue={(p.amount_pesewas / 100).toFixed(2)} required inputMode="decimal" aria-label="Amount (GHS)" />
                            </div>
                            <div className="flex gap-2">
                              <SubmitButton variant="secondary">Save</SubmitButton>
                            </div>
                          </ActionForm>
                          <form action={setFeePlanActive.bind(null, p.id, !p.active)} className="mt-1">
                            <button className="min-h-10 text-sm text-stone-600 underline">{p.active ? "Stop using" : "Use again"}</button>
                          </form>
                        </details>
                      ) : (
                        <div className="flex justify-between">
                          <span>{p.name}</span>
                          <span>{formatGhs(p.amount_pesewas)}</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {isOwner && (
            <ActionForm action={createFeePlan} className="space-y-3 border-t border-stone-100 pt-3">
              <p className="text-sm font-medium">Add a fee</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Type">
                  <Select name="kind" defaultValue="termly">
                    <option value="termly">Termly fee</option>
                    <option value="one_off">One-off (e.g. uniform)</option>
                    <option value="feeding">Feeding per day</option>
                  </Select>
                </Field>
                <Field label="Name">
                  <Input name="name" required maxLength={80} placeholder="Full day" />
                </Field>
                <Field label="Amount (GHS)">
                  <Input name="amount" required inputMode="decimal" placeholder="1500" />
                </Field>
              </div>
              <SubmitButton>Add fee</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Terms">
            {!terms?.length && <Empty>No terms yet.</Empty>}
            <ul className="mb-3 divide-y divide-stone-100 text-sm">
              {terms?.map((t) => (
                <li key={t.id} className="py-2">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-stone-600">
                    {formatDay(t.starts_on)} – {formatDay(t.ends_on)} · fees due {formatDay(t.fees_due_on)}
                  </p>
                </li>
              ))}
            </ul>
            <ActionForm action={createTerm}>
              <Field label="Name">
                <Input name="name" required maxLength={60} placeholder="Term 1 2027" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="First day">
                  <Input name="starts_on" type="date" required />
                </Field>
                <Field label="Last day">
                  <Input name="ends_on" type="date" required />
                </Field>
                <Field label="Fees due">
                  <Input name="fees_due_on" type="date" required />
                </Field>
              </div>
              <SubmitButton variant="secondary">Add term</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Sibling discount">
            <ActionForm action={setSiblingDiscount} resetOnSuccess={false}>
              <Field label="Discount on the termly fee for each younger sibling (%)" hint="The eldest child pays the full fee.">
                <Input
                  name="percent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={school?.sibling_discount_percent ?? 0}
                  disabled={!isOwner}
                />
              </Field>
              {isOwner && <SubmitButton variant="secondary">Save</SubmitButton>}
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
