import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, PageHeader, Textarea } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { addDays } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { formatWeek, weekStart } from "@/lib/weeks";
import { savePlan } from "./actions";

export default async function TeacherLessonPlans() {
  const user = await requireRole("teacher");
  const supabase = await createClient();
  const thisWeek = weekStart();
  const weeks = [thisWeek, addDays(thisWeek, 7)];
  const [{ data: assignments }, { data: plans }] = await Promise.all([
    supabase.from("staff_assignments").select("classes(id, name)").eq("teacher_id", user.id),
    supabase.from("lesson_plans").select("class_id, week_start, body, owner_comment").in("week_start", weeks),
  ]);
  const classes = (assignments ?? [])
    .map((a) => a.classes as unknown as { id: string; name: string } | null)
    .filter((c): c is { id: string; name: string } => !!c);

  return (
    <>
      <PageHeader title="Lesson plans" subtitle="A short plan per class per week. The office can read it and leave a comment." />
      {!classes.length && <Empty>You haven&apos;t been added to a class yet.</Empty>}
      <div className="space-y-4">
        {classes.map((c) =>
          weeks.map((w) => {
            const plan = plans?.find((p) => p.class_id === c.id && p.week_start === w);
            return (
              <Card key={`${c.id}-${w}`} title={`${c.name} · ${formatWeek(w)}`}>
                {plan?.owner_comment && (
                  <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Office comment: {plan.owner_comment}</p>
                )}
                <ActionForm action={savePlan.bind(null, c.id, w)} resetOnSuccess={false}>
                  <Textarea
                    name="body"
                    rows={6}
                    maxLength={8000}
                    defaultValue={plan?.body ?? ""}
                    placeholder={"Practical life: …\nSensorial: …\nLanguage: …\nMaths: …\nCircle time / songs: …"}
                    aria-label="Plan"
                  />
                  <SubmitButton variant="secondary">Save plan</SubmitButton>
                </ActionForm>
              </Card>
            );
          }),
        )}
      </div>
    </>
  );
}
