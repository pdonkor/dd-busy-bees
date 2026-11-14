"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

/** Saves a teacher's report draft. Only the office can share it with the parents. */
export async function saveReport(childId: string, termId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher", "owner", "admin");
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 20) return { error: "The report looks too short." };
  if (body.length > 12000) return { error: "The report is too long." };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("reports")
    .select("id")
    .eq("child_id", uuid.parse(childId))
    .eq("term_id", uuid.parse(termId))
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("reports").update({ body }).eq("id", existing.id)
    : await supabase.from("reports").insert({ school_id: user.schoolId, child_id: childId, term_id: termId, body, author_id: user.id });
  if (error) {
    return { error: error.message.includes("shared") ? "This report has been shared already; ask the office to change it." : "That didn't save." };
  }
  revalidatePath("/teacher/reports");
  revalidatePath("/owner/reports");
  return { success: "Report saved." };
}
