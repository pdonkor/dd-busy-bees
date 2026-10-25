import { Field, Input, Select, Textarea } from "@/components/ui";

export type ChildRow = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  class_id: string | null;
  start_date: string | null;
  allergies: string | null;
  medical_notes: string | null;
  photo_consent: boolean;
  outings_consent: boolean;
  status: "active" | "left";
};

export function ChildFields({ child, classes }: { child?: ChildRow; classes: { id: string; name: string }[] }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <Input name="first_name" defaultValue={child?.first_name} required maxLength={80} />
        </Field>
        <Field label="Surname">
          <Input name="last_name" defaultValue={child?.last_name} required maxLength={80} />
        </Field>
        <Field label="Date of birth">
          <Input name="date_of_birth" type="date" defaultValue={child?.date_of_birth} required />
        </Field>
        <Field label="Start date">
          <Input name="start_date" type="date" defaultValue={child?.start_date ?? ""} />
        </Field>
        <Field label="Class">
          <Select name="class_id" defaultValue={child?.class_id ?? ""}>
            <option value="">Not assigned yet</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Allergies" hint="Shown to the child's teachers on every screen.">
        <Textarea name="allergies" defaultValue={child?.allergies ?? ""} maxLength={2000} />
      </Field>
      <Field label="Medical notes">
        <Textarea name="medical_notes" defaultValue={child?.medical_notes ?? ""} maxLength={2000} />
      </Field>
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 font-medium">Consents</legend>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="photo_consent" defaultChecked={child?.photo_consent} className="h-5 w-5" />
          Photos may be taken and shared with this child&apos;s family
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="outings_consent" defaultChecked={child?.outings_consent} className="h-5 w-5" />
          May go on school outings
        </label>
      </fieldset>
    </div>
  );
}
