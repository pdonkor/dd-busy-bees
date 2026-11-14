import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveSchool } from "./actions";
import { LocationButton } from "./location-button";

export default async function SettingsPage() {
  const user = await requireRole("owner", "admin");
  const supabase = await createClient();
  const { data: school } = await supabase
    .from("schools")
    .select("name, address, latitude, longitude, geofence_m, late_after_min")
    .single();
  const isOwner = user.role === "owner";

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={isOwner ? "School details and clock-in rules." : "Only the owner can change these."}
      />
      <Card title="School">
        <ActionForm action={saveSchool} resetOnSuccess={false}>
          <fieldset disabled={!isOwner} className="space-y-3">
            <Field label="School name">
              <Input name="name" defaultValue={school?.name ?? ""} required maxLength={120} />
            </Field>
            <Field label="Address">
              <Input name="address" defaultValue={school?.address ?? ""} maxLength={300} />
            </Field>
            <p className="pt-2 text-sm font-medium text-stone-800">Location for staff clock-in</p>
            <p className="text-xs text-stone-500">
              Stand at the school entrance and use the button, or paste coordinates from Google Maps. Leave blank to
              skip the location check.
            </p>
            <LocationButton />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Latitude">
                <Input name="latitude" inputMode="decimal" defaultValue={school?.latitude ?? ""} />
              </Field>
              <Field label="Longitude">
                <Input name="longitude" inputMode="decimal" defaultValue={school?.longitude ?? ""} />
              </Field>
              <Field label="Allowed distance (metres)" hint="How far from that point a phone may be when scanning.">
                <Input name="geofence_m" type="number" min={50} max={2000} defaultValue={school?.geofence_m ?? 200} />
              </Field>
              <Field label="Late after (minutes)" hint="Grace period after a teacher's planned start.">
                <Input name="late_after_min" type="number" min={0} max={120} defaultValue={school?.late_after_min ?? 10} />
              </Field>
            </div>
            {isOwner && <SubmitButton>Save</SubmitButton>}
          </fieldset>
        </ActionForm>
      </Card>
    </>
  );
}
