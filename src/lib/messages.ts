import "server-only";
import { serverEnv } from "@/lib/env";
import { sendBatch } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lets a parent know the school has written to them. The SMS never contains the
 * message itself, only a prompt to open the app, so nothing private sits in SMS.
 */
export async function notifyParentOfReply(schoolId: string, parentId: string, messageId: string) {
  const admin = createAdminClient();
  const { data: parent } = await admin.from("profiles").select("phone, active").eq("id", parentId).single();
  if (!parent?.phone || !parent.active) return;
  await sendBatch(admin, [
    {
      schoolId,
      kind: "message",
      dedupeKey: `message:${messageId}`,
      to: parent.phone,
      message: `DD Busy Bees: you have a new message from the school. Read it in the app: ${serverEnv().APP_URL}/parent/messages`,
      recipientId: parentId,
    },
  ]);
}
