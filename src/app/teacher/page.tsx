import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TeacherHome() {
  const user = await requireRole("teacher");
  const supabase = await createClient();
  // Row-level security limits this to children in the teacher's own classes.
  const [{ data: assignments }, { data: children }] = await Promise.all([
    supabase.from("staff_assignments").select("classes(id, name)").eq("teacher_id", user.id),
    supabase
      .from("children")
      .select("id, first_name, last_name, allergies, medical_notes, class_id")
      .eq("status", "active")
      .order("first_name"),
  ]);
  const classes = (assignments ?? [])
    .map((a) => a.classes as unknown as { id: string; name: string } | null)
    .filter((c): c is { id: string; name: string } => !!c);

  return (
    <>
      <PageHeader
        title={`Good day, ${user.fullName.split(" ")[0]}`}
        subtitle="Attendance, activity logging and your task checklist arrive in the next phase."
      />
      {!classes.length && <Empty>You haven&apos;t been added to a class yet. Please ask the school office.</Empty>}
      <div className="space-y-4">
        {classes.map((cls) => {
          const inClass = (children ?? []).filter((c) => c.class_id === cls.id);
          return (
            <Card key={cls.id} title={`${cls.name} · ${inClass.length} children`}>
              <ul className="divide-y divide-stone-100">
                {inClass.map((c) => (
                  <li key={c.id} className="py-2 text-sm">
                    <span className="font-medium">
                      {c.first_name} {c.last_name}
                    </span>
                    {c.allergies && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">
                        Allergy: {c.allergies}
                      </span>
                    )}
                    {c.medical_notes && <p className="mt-1 text-xs text-stone-600">{c.medical_notes}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
