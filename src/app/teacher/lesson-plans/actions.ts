"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { parseDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { weekStart } from "@/lib/weeks";

export async function savePlan(classId: string, week: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const monday = parseDate(week);
  if (!monday || weekStart(monday) !== monday) return { error: "That week isn't valid." };
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write the plan first." };
  if (body.length > 8000) return { error: "That plan is too long." };
  const supabase = await createClient();
  const { error } = await supabase.from("lesson_plans").upsert(
    { school_id: user.schoolId, class_id: z.string().uuid().parse(classId), week_start: monday, body, author_id: user.id },
    { onConflict: "class_id,week_start" },
  );
  if (error) return { error: "That didn't save. Please try again." };
  revalidatePath("/teacher/lesson-plans");
  return { success: "Plan saved." };
}
