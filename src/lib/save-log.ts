import "server-only";
import type { CurrentUser } from "@/lib/auth";
import type { ParsedLog } from "@/lib/logs";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Saves a log and tags its children, as the logged-in teacher (row-level security
 * limits them to their own classes). Returns "duplicate" when a log with this id is
 * already saved, which happens when an offline log is sent twice.
 */
export async function saveLog(
  supabase: Db,
  user: Pick<CurrentUser, "id" | "schoolId">,
  log: ParsedLog,
  opts: { id: string; occurredAt?: string },
): Promise<"saved" | "duplicate" | "rejected" | "failed"> {
  const { kind, body, area_id, material_id, stage, children } = log;
  const { error } = await supabase.from("activity_logs").insert({
    id: opts.id,
    kind,
    body,
    area_id,
    material_id,
    stage,
    school_id: user.schoolId,
    logged_by: user.id,
    ...(opts.occurredAt ? { occurred_at: opts.occurredAt } : {}),
  });
  if (error) return error.code === "23505" ? "duplicate" : outcome(error.code);
  const { error: tagError } = await supabase
    .from("activity_children")
    .insert(children.map((child_id) => ({ log_id: opts.id, child_id, school_id: user.schoolId })));
  if (tagError) {
    await supabase.from("activity_logs").delete().eq("id", opts.id);
    return outcome(tagError.code);
  }
  return "saved";
}

/**
 * "rejected" when the database refused the data itself (not allowed, bad value, missing
 * child), which won't change on a retry; "failed" for anything that might, such as a
 * dropped connection.
 */
export function outcome(code: string | undefined): "rejected" | "failed" {
  return code && /^(42|23|22)/.test(code) ? "rejected" : "failed";
}
