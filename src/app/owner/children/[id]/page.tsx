import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, Field, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  addPickup,
  approvePickup,
  inviteParent,
  removeGuardian,
  removePickup,
  revokeInvite,
  setChildStatus,
  updateChild,
} from "../../actions";
import { ChildFields, type ChildRow } from "../child-fields";

type Guardian = {
  parent_id: string;
  relationship: string;
  profiles: { full_name: string; phone: string | null; active: boolean } | null;
};

export default async function ChildPage({ params }: { params: Promise<{ id: string }> }) {
  // The layout checks too, but layouts are skipped on some client navigations.
  await requireRole("owner", "admin");
  const { id } = await params;
  const supabase = await createClient();
  const { data: child } = await supabase.from("children").select("*").eq("id", id).maybeSingle();
  if (!child) notFound();

  const [{ data: classes }, { data: guardians }, { data: pickups }, { data: invites }, { data: contacts }] = await Promise.all([
    supabase.from("classes").select("id, name").eq("archived", false).order("name"),
    supabase.from("guardians").select("parent_id, relationship, profiles(full_name, phone, active)").eq("child_id", id),
    supabase.from("authorised_pickups").select("id, full_name, phone, relationship, approved").eq("child_id", id),
    supabase
      .from("invites")
      .select("id, full_name, phone, expires_at")
      .eq("child_id", id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
    supabase.from("emergency_contacts").select("id, full_name, phone, relationship").eq("child_id", id),
  ]);
  const extra = child as { doctor_name: string | null; doctor_phone: string | null; enrolment_submitted_at: string | null };
  const c = child as ChildRow;

  return (
    <>
      <PageHeader
        title={`${c.first_name} ${c.last_name}`}
        subtitle={
          c.status === "left"
            ? "Has left the school"
            : extra.enrolment_submitted_at
              ? "Enrolment form completed by the parent"
              : "Waiting for the parent to complete the enrolment form"
        }
        action={
          <form action={setChildStatus.bind(null, c.id, c.status === "active" ? "left" : "active")}>
            <SubmitButton variant="secondary" pendingText="Saving…">
              {c.status === "active" ? "Mark as left" : "Re-enrol"}
            </SubmitButton>
          </form>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title="Details">
          <ActionForm action={updateChild.bind(null, c.id)} resetOnSuccess={false}>
            <ChildFields child={c} classes={classes ?? []} />
            <SubmitButton>Save changes</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-4">
          <Card title="Parents and guardians">
            {!guardians?.length && !invites?.length && <Empty>No parent linked yet.</Empty>}
            <ul className="mb-3 divide-y divide-stone-100 text-sm">
              {(guardians as unknown as Guardian[] | null)?.map((g) => (
                <li key={g.parent_id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {g.profiles?.full_name} ({g.relationship}) · {g.profiles?.phone}
                    {g.profiles && !g.profiles.active && <span className="ml-1 text-red-700">switched off</span>}
                  </span>
                  <form action={removeGuardian.bind(null, c.id, g.parent_id)}>
                    <button className="min-h-10 px-2 text-red-700 underline">Unlink</button>
                  </form>
                </li>
              ))}
              {invites?.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-stone-600">
                  <span>
                    {i.full_name} · invited, not accepted yet
                  </span>
                  <form action={revokeInvite.bind(null, i.id)}>
                    <button className="min-h-10 px-2 text-red-700 underline">Cancel</button>
                  </form>
                </li>
              ))}
            </ul>
            <ActionForm action={inviteParent.bind(null, c.id)}>
              <Field label="Parent's name">
                <Input name="full_name" required maxLength={120} />
              </Field>
              <Field label="Mobile number">
                <Input name="phone" type="tel" inputMode="tel" required placeholder="024 123 4567" />
              </Field>
              <Field label="Relationship">
                <Input name="relationship" required maxLength={40} placeholder="mother, father, aunt…" />
              </Field>
              <SubmitButton pendingText="Sending invite…">Invite parent</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Emergency contacts and doctor">
            {!contacts?.length && !extra.doctor_name && <p className="text-sm text-stone-500">None given yet.</p>}
            <ul className="text-sm">
              {contacts?.map((ec) => (
                <li key={ec.id} className="py-1">
                  {ec.full_name}
                  {ec.relationship && ` (${ec.relationship})`} · {ec.phone}
                </li>
              ))}
              {extra.doctor_name && (
                <li className="py-1">
                  Doctor: {extra.doctor_name}
                  {extra.doctor_phone && ` · ${extra.doctor_phone}`}
                </li>
              )}
            </ul>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link href={`/owner/fees/${c.id}`} className="text-amber-800 underline">
                Fees account
              </Link>
              <Link href={`/owner/children/${c.id}/progress`} className="text-amber-800 underline">
                Progress
              </Link>
            </div>
          </Card>
          <Card title="Who else may pick up">
            <p className="mb-2 text-xs text-stone-500">Parents linked above can always pick up.</p>
            <ul className="mb-3 divide-y divide-stone-100 text-sm">
              {pickups?.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {p.full_name}
                    {p.relationship && ` (${p.relationship})`}
                    {p.phone && ` · ${p.phone}`}
                    {!p.approved && <span className="ml-1 text-amber-800">asked for by parent</span>}
                  </span>
                  <span className="flex">
                    {!p.approved && (
                      <form action={approvePickup.bind(null, c.id, p.id)}>
                        <button className="min-h-10 px-2 text-green-800 underline">Approve</button>
                      </form>
                    )}
                    <form action={removePickup.bind(null, c.id, p.id)}>
                      <button className="min-h-10 px-2 text-red-700 underline">Remove</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
            <ActionForm action={addPickup.bind(null, c.id)}>
              <Field label="Name">
                <Input name="full_name" required maxLength={120} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mobile (optional)">
                  <Input name="phone" type="tel" inputMode="tel" />
                </Field>
                <Field label="Relationship (optional)">
                  <Input name="relationship" maxLength={40} />
                </Field>
              </div>
              <SubmitButton variant="secondary">Add person</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
