import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setDailySms, setPickupPin } from "./actions";

export default async function AccountPage() {
  const user = await requireRole("parent");
  const supabase = await createClient();
  const [{ data: profile }, { data: hasPin }] = await Promise.all([
    supabase.from("profiles").select("phone, email, daily_sms").eq("id", user.id).single(),
    supabase.rpc("has_pickup_pin"),
  ]);

  return (
    <>
      <PageHeader title="My account" subtitle={`${user.fullName} · ${profile?.phone ?? profile?.email ?? ""}`} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Pick-up PIN">
          <p className="mb-3 text-sm text-stone-600">
            {hasPin
              ? "You have a PIN. When you collect your child, type it on the teacher's phone. You can change it here."
              : "Set a 4-digit PIN. When you collect your child, you type it on the teacher's phone to sign them out."}
          </p>
          <ActionForm action={setPickupPin}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={hasPin ? "New PIN" : "PIN"}>
                <Input name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" />
              </Field>
              <Field label="Type it again">
                <Input name="confirm" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" />
              </Field>
            </div>
            <SubmitButton>{hasPin ? "Change PIN" : "Set PIN"}</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="End-of-day SMS">
          <p className="mb-3 text-sm text-stone-600">
            {profile?.daily_sms
              ? "You get a short SMS summary of your child's day at about 4 pm on school days."
              : "Daily summary SMS are switched off. You can still see the day in the app."}
          </p>
          <form action={setDailySms.bind(null, !profile?.daily_sms)}>
            <SubmitButton variant="secondary">{profile?.daily_sms ? "Switch off" : "Switch on"}</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
