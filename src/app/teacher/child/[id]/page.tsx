import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressView } from "@/components/progress-view";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

/** A child's profile for their teacher: health notes, who may collect, and progress. No family phone numbers. */
export default async function TeacherChildPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("teacher");
  const { id } = await params;
  const supabase = await createClient();
  const { data: child } = await supabase
    .from("children")
    .select("id, first_name, last_name, date_of_birth, allergies, medical_notes, photo_consent, outings_consent, classes(name)")
    .eq("id", id)
    .maybeSingle();
  if (!child) notFound();
  const [{ data: pickups }, { data: incidents }] = await Promise.all([
    supabase.rpc("pickup_options", { target_child: id }),
    supabase.from("incidents").select("id, kind, occurred_at, description").eq("child_id", id).order("occurred_at", { ascending: false }).limit(5),
  ]);

  return (
    <>
      <PageHeader
        title={`${child.first_name} ${child.last_name}`}
        subtitle={`${(child.classes as unknown as { name: string } | null)?.name ?? ""} · born ${formatDay(child.date_of_birth)}`}
        action={
          <Link href={`/teacher/incident?child=${id}`} className="text-sm text-red-800 underline">
            Report an incident
          </Link>
        }
      />
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card title="Health and permissions">
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline font-medium">Allergies: </dt>
              <dd className="inline">{child.allergies ?? "none recorded"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Medical notes: </dt>
              <dd className="inline">{child.medical_notes ?? "none"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Photos: </dt>
              <dd className="inline">{child.photo_consent ? "allowed" : "not allowed"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Outings: </dt>
              <dd className="inline">{child.outings_consent ? "allowed" : "not allowed"}</dd>
            </div>
          </dl>
        </Card>
        <Card title="May be collected by">
          <ul className="text-sm">
            {(pickups as { name: string; relationship: string | null }[] | null)?.map((p) => (
              <li key={p.name}>
                {p.name}
                {p.relationship && ` (${p.relationship})`}
              </li>
            ))}
          </ul>
          {incidents?.length ? (
            <>
              <p className="mt-3 text-sm font-medium">Recent incidents</p>
              <ul className="text-sm text-stone-700">
                {incidents.map((i) => (
                  <li key={i.id}>
                    {formatDay(i.occurred_at.slice(0, 10))}: {i.description.slice(0, 80)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      </div>
      <h2 className="mb-2 text-lg font-semibold">Progress</h2>
      <ProgressView supabase={supabase} childId={id} />
    </>
  );
}
