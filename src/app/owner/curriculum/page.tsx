import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, Field, Input, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { addArea, addMaterial, deleteArea, deleteMaterial } from "../actions";

export default async function CurriculumPage() {
  const supabase = await createClient();
  const { data: areas } = await supabase
    .from("curriculum_areas")
    .select("id, name, description, materials(id, name, position)")
    .order("position")
    .order("position", { referencedTable: "materials" });

  return (
    <>
      <PageHeader
        title="Curriculum"
        subtitle="The areas and materials teachers choose from when they log an activity. Add your own; nothing is fixed."
      />
      <Card title="Add a curriculum area">
        <ActionForm action={addArea}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Area name">
              <Input name="name" required maxLength={80} placeholder="e.g. Practical Life" />
            </Field>
            <Field label="Description (optional)">
              <Input name="description" maxLength={500} />
            </Field>
          </div>
          <SubmitButton>Add area</SubmitButton>
        </ActionForm>
      </Card>
      <div className="mt-6 space-y-3">
        {!areas?.length && <Empty>No curriculum areas yet.</Empty>}
        {areas?.map((area) => (
          <Card key={area.id}>
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{area.name}</h2>
                {area.description && <p className="text-sm text-stone-600">{area.description}</p>}
              </div>
              <form action={deleteArea.bind(null, area.id)}>
                <SubmitButton variant="danger" pendingText="Removing…">
                  Remove area
                </SubmitButton>
              </form>
            </div>
            <ul className="mb-3 divide-y divide-stone-100">
              {area.materials.map((m: { id: string; name: string }) => (
                <li key={m.id} className="flex items-center justify-between py-1 text-sm">
                  {m.name}
                  <form action={deleteMaterial.bind(null, m.id)}>
                    <button className="min-h-10 px-2 text-red-700 underline">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
            <ActionForm action={addMaterial.bind(null, area.id)} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label="Add a material">
                  <Input name="name" required maxLength={120} placeholder="e.g. Pink Tower" />
                </Field>
              </div>
              <SubmitButton variant="secondary">Add</SubmitButton>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
