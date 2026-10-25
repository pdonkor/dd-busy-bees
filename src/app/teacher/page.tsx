import Link from "next/link";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDay, formatTime, today } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { checkIn, checkOut } from "./actions";
import { CheckOutForm } from "./check-out-form";

export default async function TeacherHome() {
  const user = await requireRole("teacher");
  const supabase = await createClient();
  const date = today();
  // Row-level security limits this to children in the teacher's own classes.
  const [{ data: assignments }, { data: children }, { data: attendance }] = await Promise.all([
    supabase.from("staff_assignments").select("classes(id, name)").eq("teacher_id", user.id),
    supabase
      .from("children")
      .select("id, first_name, last_name, allergies, medical_notes, class_id")
      .eq("status", "active")
      .order("first_name"),
    supabase
      .from("attendance")
      .select("child_id, checked_in_at, checked_out_at, collected_by, collected_by_unlisted")
      .eq("date", date),
  ]);
  const classes = (assignments ?? [])
    .map((a) => a.classes as unknown as { id: string; name: string } | null)
    .filter((c): c is { id: string; name: string } => !!c);
  const byChild = new Map((attendance ?? []).map((a) => [a.child_id, a]));

  // Pick-up names are only needed for children who are in and not yet collected.
  const waiting = (children ?? []).filter((c) => byChild.has(c.id) && !byChild.get(c.id)?.checked_out_at);
  const pickups = new Map(
    await Promise.all(
      waiting.map(async (c) => {
        const { data } = await supabase.rpc("pickup_options", { target_child: c.id });
        return [c.id, (data ?? []) as { name: string; relationship: string | null }[]] as const;
      }),
    ),
  );

  return (
    <>
      <PageHeader
        title={`Good day, ${user.fullName.split(" ")[0]}`}
        subtitle={formatDay(date)}
        action={
          <Link href="/teacher/log" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-950">
            Log activity
          </Link>
        }
      />
      {!classes.length && <Empty>You haven&apos;t been added to a class yet. Please ask the school office.</Empty>}
      <div className="space-y-4">
        {classes.map((cls) => {
          const inClass = (children ?? []).filter((c) => c.class_id === cls.id);
          const present = inClass.filter((c) => byChild.has(c.id)).length;
          return (
            <Card key={cls.id} title={`${cls.name} · ${present} of ${inClass.length} in today`}>
              <ul className="divide-y divide-stone-100">
                {inClass.map((c) => {
                  const a = byChild.get(c.id);
                  return (
                    <li key={c.id} className="py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-medium">
                            {c.first_name} {c.last_name}
                          </span>
                          {c.allergies && (
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">
                              Allergy: {c.allergies}
                            </span>
                          )}
                          {c.medical_notes && <p className="mt-1 text-xs text-stone-600">{c.medical_notes}</p>}
                        </div>
                        {!a && (
                          <form action={checkIn.bind(null, c.id)}>
                            <SubmitButton pendingText="Checking in…">Check in</SubmitButton>
                          </form>
                        )}
                        {a && (
                          <span className="text-xs text-stone-600">
                            In at {formatTime(a.checked_in_at)}
                            {a.checked_out_at && (
                              <>
                                {" "}
                                · Out at {formatTime(a.checked_out_at)} with {a.collected_by}
                                {a.collected_by_unlisted && (
                                  <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
                                    not on list
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        )}
                      </div>
                      {a && !a.checked_out_at && (
                        <CheckOutForm action={checkOut.bind(null, c.id)} options={pickups.get(c.id) ?? []} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
