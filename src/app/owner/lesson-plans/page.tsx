import { revalidatePath } from "next/cache";
import Link from "next/link";
import { z } from "zod";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, Input, PageHeader } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { addDays, parseDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { formatWeek, weekStart } from "@/lib/weeks";

async function comment(planId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  "use server";
  await requireRole("owner", "admin");
  const text = String(formData.get("owner_comment") ?? "").trim().slice(0, 2000) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("lesson_plans").update({ owner_comment: text }).eq("id", z.string().uuid().parse(planId));
  if (error) return { error: "That didn't save." };
  revalidatePath("/owner/lesson-plans");
  return { success: "Comment saved. The teacher sees it on their plan." };
}

export default async function OwnerLessonPlans({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireRole("owner", "admin");
  const requested = parseDate((await searchParams).week);
  const week = weekStart(requested ?? undefined);
  const supabase = await createClient();
  const [{ data: classes }, { data: plans }] = await Promise.all([
    supabase.from("classes").select("id, name").eq("archived", false).order("name"),
    supabase
      .from("lesson_plans")
      .select("id, class_id, body, owner_comment, updated_at, profiles(full_name)")
      .eq("week_start", week),
  ]);

  return (
    <>
      <PageHeader title="Lesson plans" subtitle={formatWeek(week)} />
      <div className="mb-4 flex justify-between text-sm">
        <Link href={`/owner/lesson-plans?week=${addDays(week, -7)}`} className="text-amber-800 underline">
          ← Previous week
        </Link>
        <Link href={`/owner/lesson-plans?week=${addDays(week, 7)}`} className="text-amber-800 underline">
          Next week →
        </Link>
      </div>
      {!classes?.length && <Empty>No classes yet.</Empty>}
      <div className="space-y-4">
        {classes?.map((c) => {
          const plan = plans?.find((p) => p.class_id === c.id);
          return (
            <Card key={c.id} title={c.name}>
              {!plan ? (
                <p className="text-sm text-amber-800">No plan written for this week.</p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-stone-500">By {(plan.profiles as unknown as { full_name: string } | null)?.full_name}</p>
                  <div className="whitespace-pre-wrap text-sm">{plan.body}</div>
                  <ActionForm action={comment.bind(null, plan.id)} resetOnSuccess={false} className="mt-3 flex flex-wrap gap-2">
                    <Input
                      name="owner_comment"
                      defaultValue={plan.owner_comment ?? ""}
                      placeholder="Comment for the teacher"
                      maxLength={2000}
                      className="w-auto flex-1"
                    />
                    <SubmitButton variant="secondary">Save comment</SubmitButton>
                  </ActionForm>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
