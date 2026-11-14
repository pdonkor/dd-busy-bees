import "server-only";
import type { ActionState } from "@/lib/action-state";
import { serverEnv } from "@/lib/env";
import { sendSms } from "@/lib/sms";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/tokens";

/**
 * Creates a one-time invite (as the logged-in office user, so row-level security
 * applies) and texts the link when there is a phone number. Kept out of the
 * "use server" files so it can't be called from the browser with arbitrary input.
 */
export async function createInvite(
  user: { id: string; schoolId: string },
  invite: {
    role: "admin" | "teacher" | "parent";
    full_name: string;
    phone?: string | null;
    email?: string | null;
    class_id?: string | null;
    child_id?: string | null;
    relationship?: string | null;
  },
): Promise<ActionState> {
  const token = generateToken();
  const supabase = await createClient();
  const { error } = await supabase
    .from("invites")
    .insert({ ...invite, school_id: user.schoolId, token_hash: hashToken(token), created_by: user.id });
  if (error) return { error: "Couldn't create the invite. Please try again." };

  const link = `${serverEnv().APP_URL}/invite/${token}`;
  if (invite.phone) {
    try {
      await sendSms(invite.phone, `You've been invited to DD Busy Bees. Open this link to join: ${link}`);
    } catch {
      return { success: "Invite created, but the SMS didn't send. Share this link with them instead:", link };
    }
    return { success: `Invite sent by SMS to ${invite.phone}. You can also share this link (valid 7 days):`, link };
  }
  return { success: "Invite created. Send this link to them (valid 7 days, works once):", link };
}
