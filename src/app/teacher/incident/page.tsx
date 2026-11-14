import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reportIncident } from "./actions";

export default async function IncidentPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  await requireRole("teacher");
  const { child } = await searchParams;
  const supabase = await createClient();
  const { data: children } = await supabase.from("children").select("id, first_name, last_name").eq("status", "active").order("first_name");
  const now = new Date().toISOString().slice(11, 16);
  return (
    <>
      <PageHeader
        title="Report an incident"
        subtitle="Accidents, incidents and illness. The parents are told automatically and asked to acknowledge; the office signs it off."
      />
      <Card>
        <ActionForm action={reportIncident}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Child">
              <Select name="child_id" defaultValue={child ?? ""} required>
                <option value="">Choose…</option>
                {children?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select name="kind" defaultValue="accident">
                <option value="accident">Accident (bump, fall, cut)</option>
                <option value="incident">Incident (behaviour, other)</option>
                <option value="illness">Illness</option>
              </Select>
            </Field>
            <Field label="Time today">
              <Input name="time" type="time" defaultValue={now} required />
            </Field>
          </div>
          <Field label="What happened">
            <Textarea name="description" required maxLength={4000} rows={4} />
          </Field>
          <Field label="What was done (first aid, who was told)">
            <Textarea name="action_taken" maxLength={4000} rows={3} />
          </Field>
          <SubmitButton pendingText="Saving…">Save report</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
