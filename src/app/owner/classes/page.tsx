import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Button, Card, Empty, Field, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createClass, setClassArchived, updateClass } from "../actions";

type ClassRow = {
  id: string;
  name: string;
  capacity: number | null;
  min_age_months: number | null;
  max_age_months: number | null;
  archived: boolean;
};

const years = (months: number | null) => (months === null ? "" : String(months / 12));

function ClassFields({ c }: { c?: ClassRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Field label="Name">
        <Input name="name" defaultValue={c?.name} required maxLength={80} placeholder="e.g. Bumblebees" />
      </Field>
      <Field label="Places">
        <Input name="capacity" type="number" min={1} max={200} defaultValue={c?.capacity ?? ""} />
      </Field>
      <Field label="Age from (years)">
        <Input name="min_age_years" type="number" min={0} max={12} step={0.5} defaultValue={years(c?.min_age_months ?? null)} />
      </Field>
      <Field label="Age to (years)">
        <Input name="max_age_years" type="number" min={0} max={12} step={0.5} defaultValue={years(c?.max_age_months ?? null)} />
      </Field>
    </div>
  );
}

export default async function ClassesPage() {
  // The layout checks too, but layouts are skipped on some client navigations.
  await requireRole("owner", "admin");
  const supabase = await createClient();
  const [{ data: classes }, { data: children }] = await Promise.all([
    supabase.from("classes").select("*").order("archived").order("name"),
    supabase.from("children").select("class_id").eq("status", "active"),
  ]);
  const enrolled = new Map<string, number>();
  for (const child of children ?? []) {
    if (child.class_id) enrolled.set(child.class_id, (enrolled.get(child.class_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader title="Classes" subtitle="Name your classes and set how many places each has." />
      <Card title="Add a class">
        <ActionForm action={createClass}>
          <ClassFields />
          <SubmitButton>Add class</SubmitButton>
        </ActionForm>
      </Card>
      <div className="mt-6 space-y-3">
        {!classes?.length && <Empty>No classes yet.</Empty>}
        {(classes as ClassRow[] | null)?.map((c) => (
          <Card key={c.id} className={c.archived ? "opacity-60" : ""}>
            <p className="mb-3 text-sm text-stone-600">
              {enrolled.get(c.id) ?? 0} children{c.capacity ? ` of ${c.capacity} places` : ""}
              {c.archived && " · archived"}
            </p>
            <ActionForm action={updateClass.bind(null, c.id)} resetOnSuccess={false}>
              <ClassFields c={c} />
              <div className="flex flex-wrap gap-2">
                <SubmitButton variant="secondary">Save changes</SubmitButton>
                <Button variant="secondary" formAction={setClassArchived.bind(null, c.id, !c.archived)} formNoValidate>
                  {c.archived ? "Restore" : "Archive"}
                </Button>
              </div>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
