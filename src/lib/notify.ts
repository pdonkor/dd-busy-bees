import "server-only";
import { sendSms } from "@/lib/sms";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type OutgoingSms = {
  schoolId: string;
  kind: string;
  /** Unique per message, so a retried job never sends the same SMS twice. */
  dedupeKey: string;
  to: string;
  message: string;
  recipientId?: string | null;
  childId?: string | null;
};

/**
 * Sends each SMS at most once: the dedupe key is claimed in sms_log before sending,
 * and released again if the send fails so the next run retries it. Sends go out a
 * few at a time so a batch doesn't hammer the SMS provider.
 */
export async function sendBatch(admin: Admin, messages: OutgoingSms[], concurrency = 5) {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const queue = [...messages];
  async function worker() {
    for (let m = queue.shift(); m; m = queue.shift()) {
      const { data: claimed } = await admin
        .from("sms_log")
        .upsert(
          {
            school_id: m.schoolId,
            kind: m.kind,
            dedupe_key: m.dedupeKey,
            recipient_id: m.recipientId ?? null,
            child_id: m.childId ?? null,
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        )
        .select("id");
      if (!claimed?.length) {
        skipped++;
        continue;
      }
      try {
        await sendSms(m.to, m.message);
        sent++;
      } catch {
        failed++;
        await admin.from("sms_log").delete().eq("id", claimed[0].id);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { sent, skipped, failed };
}
