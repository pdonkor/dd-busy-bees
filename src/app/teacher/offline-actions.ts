"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { firstIssue } from "@/lib/action-state";
import { clampOfflineTime, logSchema, type SyncResult } from "@/lib/logs";
import { outcome, saveLog } from "@/lib/save-log";
import { createClient } from "@/lib/supabase/server";

const base = z.object({ id: z.string().uuid(), at: z.string().max(40) });
const itemSchema = z.discriminatedUnion("type", [
  base.extend({
    type: z.literal("log"),
    kind: z.string(),
    children: z.array(z.string()),
    quick: z.string().optional(),
    body: z.string().optional(),
    area_id: z.string().optional(),
    material_id: z.string().optional(),
    stage: z.string().optional(),
  }),
  base.extend({
    type: z.literal("task"),
    templateId: z.string().uuid(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(1000).optional(),
  }),
]);

/**
 * Saves logs and task ticks that a teacher made while their phone was offline. Each
 * item has an id chosen on the phone, so a batch that is sent twice (the reply was lost)
 * saves everything once. Items the database refuses are reported back and dropped;
 * anything that failed for another reason stays on the phone for the next try.
 */
export async function syncOffline(items: unknown): Promise<SyncResult[]> {
  const user = await requireRole("teacher");
  const list = z.array(z.unknown()).max(50).safeParse(items);
  if (!list.success) return [];
  const supabase = await createClient();
  const results: SyncResult[] = [];

  for (const raw of list.data) {
    const parsed = itemSchema.safeParse(raw);
    const id = (raw as { id?: unknown })?.id;
    if (!parsed.success) {
      if (typeof id === "string") results.push({ id, status: "rejected", error: "This entry couldn't be read." });
      continue;
    }
    const item = parsed.data;
    const at = clampOfflineTime(item.at);

    if (item.type === "log") {
      const log = logSchema.safeParse({ ...item, has_photo: false });
      if (!log.success) {
        results.push({ id: item.id, status: "rejected", error: firstIssue(log.error) });
        continue;
      }
      const status = await saveLog(supabase, user, log.data, { id: item.id, occurredAt: at });
      if (status !== "failed") {
        results.push({ id: item.id, status, error: status === "rejected" ? "You can't log for these children." : undefined });
      }
    } else {
      const { error } = await supabase.from("task_completions").insert({
        id: item.id,
        template_id: item.templateId,
        school_id: user.schoolId,
        due_date: item.dueDate,
        done_by: user.id,
        done_at: at,
        note: item.note?.trim() || null,
      });
      if (!error) results.push({ id: item.id, status: "saved" });
      // Someone else (or this phone, earlier) already ticked it for that day.
      else if (error.code === "23505") results.push({ id: item.id, status: "duplicate" });
      else if (outcome(error.code) === "rejected") {
        results.push({ id: item.id, status: "rejected", error: "This task can't be ticked any more." });
      }
    }
  }

  if (results.some((r) => r.status === "saved")) {
    revalidatePath("/teacher/log");
    revalidatePath("/teacher/tasks");
  }
  return results;
}
