import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { enrolFromEnquiry, updateEnquiry } from "./actions";

const STAGES = [
  ["enquiry", "New enquiry"],
  ["tour_booked", "Visit booked"],
  ["offered", "Place offered"],
  ["waitlisted", "Waiting list"],
  ["enrolled", "Enrolled"],
  ["declined", "Declined"],
] as const;

function age(dob: string) {
  const months = Math.floor((Date.now() - new Date(dob).getTime()) / (30.44 * 86_400_000));
  return months < 24 ? `${months} months` : `${Math.floor(months / 12)} yrs ${months % 12} mths`;
}

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  await requireRole("owner", "admin");
  const { stage = "open" } = await searchParams;
  const supabase = await createClient();
  const [{ data: enquiries }, { data: classes }] = await Promise.all([
    supabase.from("enquiries").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("classes").select("id, name").eq("archived", false).order("name"),
  ]);
  const counts = new Map<string, number>();
  for (const e of enquiries ?? []) counts.set(e.stage, (counts.get(e.stage) ?? 0) + 1);
  const open = ["enquiry", "tour_booked", "offered", "waitlisted"];
  const shown = (enquiries ?? []).filter((e) => (stage === "open" ? open.includes(e.stage) : e.stage === stage));
  const formUrl = `${serverEnv().APP_URL}/enquire`;

  return (
    <>
      <PageHeader title="Enquiries" subtitle={`Families who asked about a place. Share the form: ${formUrl}`} />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link
          href="/owner/enquiries"
          className={`rounded-full border px-3 py-1 ${stage === "open" ? "border-amber-500 bg-amber-100" : "border-stone-300 bg-white"}`}
        >
          Open ({open.reduce((s, k) => s + (counts.get(k) ?? 0), 0)})
        </Link>
        {STAGES.map(([key, label]) => (
          <Link
            key={key}
            href={`/owner/enquiries?stage=${key}`}
            className={`rounded-full border px-3 py-1 ${stage === key ? "border-amber-500 bg-amber-100" : "border-stone-300 bg-white"}`}
          >
            {label} ({counts.get(key) ?? 0})
          </Link>
        ))}
      </nav>
      {!shown.length && <Empty>No enquiries here.</Empty>}
      <div className="space-y-3">
        {shown.map((e) => (
          <Card key={e.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {e.child_first_name} {e.child_last_name}{" "}
                  <span className="font-normal text-stone-600">· {age(e.child_dob)}</span>
                </p>
                <p className="text-sm text-stone-700">
                  {e.parent_name}
                  {e.relationship && ` (${e.relationship})`} · <a href={`tel:${e.phone}`} className="underline">{e.phone}</a>
                  {e.email && ` · ${e.email}`}
                </p>
                <p className="text-xs text-stone-500">
                  Asked {formatDay(e.created_at.slice(0, 10))}
                  {e.start_date && ` · wants to start ${formatDay(e.start_date)}`}
                  {e.sessions && ` · ${e.sessions}`}
                </p>
                {e.message && <p className="mt-1 text-sm text-stone-700">“{e.message}”</p>}
              </div>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">
                {STAGES.find(([k]) => k === e.stage)?.[1]}
              </span>
            </div>
            {e.stage === "enrolled" ? (
              e.child_id && (
                <Link href={`/owner/children/${e.child_id}`} className="mt-2 inline-block text-sm text-amber-800 underline">
                  Open child&apos;s profile
                </Link>
              )
            ) : (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <ActionForm action={updateEnquiry.bind(null, e.id)} resetOnSuccess={false}>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Stage">
                      <Select name="stage" defaultValue={e.stage}>
                        {STAGES.filter(([k]) => k !== "enrolled").map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Visit">
                      <Input name="tour_at" type="datetime-local" defaultValue={e.tour_at ? e.tour_at.slice(0, 16) : ""} />
                    </Field>
                  </div>
                  <Field label="Notes">
                    <Textarea name="notes" defaultValue={e.notes ?? ""} maxLength={2000} rows={2} />
                  </Field>
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </ActionForm>
                <ActionForm action={enrolFromEnquiry.bind(null, e.id)}>
                  <p className="text-sm text-stone-600">
                    Enrolling adds {e.child_first_name} to the school and texts {e.parent_name} an invite to finish the
                    enrolment pack.
                  </p>
                  <Field label="Class">
                    <Select name="class_id" defaultValue="">
                      <option value="">Choose later</option>
                      {classes?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton pendingText="Enrolling…">Enrol {e.child_first_name}</SubmitButton>
                </ActionForm>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
