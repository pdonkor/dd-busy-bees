import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addEmergencyContact, removeEmergencyContact, requestPickup, submitEnrolment } from "./actions";

export default async function ParentChildPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("parent");
  const { id } = await params;
  const supabase = await createClient();
  const { data: child } = await supabase
    .from("children")
    .select(
      "id, first_name, last_name, allergies, medical_notes, doctor_name, doctor_phone, photo_consent, outings_consent, enrolment_submitted_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!child) notFound();
  const [{ data: contacts }, { data: pickups }] = await Promise.all([
    supabase.from("emergency_contacts").select("id, full_name, phone, relationship").eq("child_id", id),
    supabase.from("authorised_pickups").select("id, full_name, relationship, approved").eq("child_id", id),
  ]);

  return (
    <>
      <PageHeader
        title={`${child.first_name}'s details`}
        subtitle={
          child.enrolment_submitted_at
            ? "Keep these up to date so the school can look after your child."
            : "Please complete this enrolment form so the school can look after your child."
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Health and permissions">
          <ActionForm action={submitEnrolment.bind(null, child.id)} resetOnSuccess={false}>
            <Field label="Allergies" hint="Food, medicine, insect stings… Write 'None' if there are none.">
              <Textarea name="allergies" defaultValue={child.allergies ?? ""} maxLength={2000} rows={2} />
            </Field>
            <Field label="Medical notes" hint="Conditions, medicines, anything the teachers should know.">
              <Textarea name="medical_notes" defaultValue={child.medical_notes ?? ""} maxLength={2000} rows={2} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Doctor or clinic">
                <Input name="doctor_name" defaultValue={child.doctor_name ?? ""} maxLength={120} />
              </Field>
              <Field label="Their phone">
                <Input name="doctor_phone" type="tel" defaultValue={child.doctor_phone ?? ""} maxLength={30} />
              </Field>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="photo_consent" defaultChecked={child.photo_consent} className="mt-1" />
              <span>
                The school may take photos of {child.first_name} for the app. Photos are private to the family and staff,
                and never public.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="outings_consent" defaultChecked={child.outings_consent} className="mt-1" />
              <span>{child.first_name} may go on supervised school outings.</span>
            </label>
            <SubmitButton>{child.enrolment_submitted_at ? "Save changes" : "Submit enrolment form"}</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-4">
          <Card title="Emergency contacts">
            <p className="mb-2 text-xs text-stone-500">Who the office should call if they can&apos;t reach you.</p>
            <ul className="mb-3 divide-y divide-stone-100 text-sm">
              {contacts?.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span>
                    {c.full_name}
                    {c.relationship && ` (${c.relationship})`} · {c.phone}
                  </span>
                  <form action={removeEmergencyContact.bind(null, child.id, c.id)}>
                    <button className="min-h-10 px-2 text-red-700 underline">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
            <ActionForm action={addEmergencyContact.bind(null, child.id)}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input name="full_name" placeholder="Name" required maxLength={120} aria-label="Name" />
                <Input name="phone" type="tel" placeholder="Mobile" required aria-label="Mobile" />
                <Input name="relationship" placeholder="Relationship" maxLength={40} aria-label="Relationship" />
              </div>
              <SubmitButton variant="secondary">Add contact</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Who may collect">
            <p className="mb-2 text-xs text-stone-500">
              Parents linked to {child.first_name} can always collect. Anyone else must be approved by the office first.
            </p>
            <ul className="mb-3 divide-y divide-stone-100 text-sm">
              {pickups?.map((p) => (
                <li key={p.id} className="flex justify-between py-2">
                  <span>
                    {p.full_name}
                    {p.relationship && ` (${p.relationship})`}
                  </span>
                  {!p.approved && <span className="text-xs text-amber-800">waiting for the office</span>}
                </li>
              ))}
            </ul>
            <ActionForm action={requestPickup.bind(null, child.id)}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input name="full_name" placeholder="Name" required maxLength={120} aria-label="Name" />
                <Input name="phone" type="tel" placeholder="Mobile" required aria-label="Mobile" />
                <Input name="relationship" placeholder="Relationship" maxLength={40} aria-label="Relationship" />
              </div>
              <SubmitButton variant="secondary">Ask to add</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
