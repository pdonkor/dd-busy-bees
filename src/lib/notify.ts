import "server-only";
import { sendEmail, type Email } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

type Outgoing = {
  schoolId: string;
  kind: string;
  /** Unique per message, so a retried job never sends the same message twice. */
  dedupeKey: string;
  recipientId?: string | null;
  childId?: string | null;
};

export type OutgoingSms = Outgoing & { to: string; message: string };
export type OutgoingEmail = Outgoing & { email: Email };

/**
 * Sends each message at most once: the dedupe key is claimed in sms_log before sending,
 * and released again if the send fails so the next run retries it. Sends go out a
 * few at a time so a batch doesn't hammer the provider.
 */
async function sendOnce<T extends Outgoing>(
  admin: Admin,
  channel: "sms" | "email",
  messages: T[],
  send: (m: T) => Promise<void>,
  concurrency: number,
) {
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
            channel,
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
        await send(m);
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

export function sendBatch(admin: Admin, messages: OutgoingSms[], concurrency = 5) {
  return sendOnce(admin, "sms", messages, (m) => sendSms(m.to, m.message), concurrency);
}

export function sendEmailBatch(admin: Admin, messages: OutgoingEmail[], concurrency = 3) {
  return sendOnce(admin, "email", messages, (m) => sendEmail(m.email), concurrency);
}
