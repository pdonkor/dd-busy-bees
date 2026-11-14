import "server-only";
import type { ActionState } from "@/lib/action-state";
import { sendEmail, simpleEmail } from "@/lib/email";
import { serverEnv } from "@/lib/env";
import { sendSms } from "@/lib/sms";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/tokens";

/**
 * Creates a one-time invite (as the logged-in office user, so row-level security
 * applies) and texts the link when there is a phone number. Email invites (office
 * accounts) are only ever sent to the mailbox and the link is never shown on screen,
 * so whoever sets the password has proved they can read that mailbox. Kept out of the
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
  const { data: created, error } = await supabase
    .from("invites")
    .insert({ ...invite, school_id: user.schoolId, token_hash: hashToken(token), created_by: user.id })
    .select("id")
    .single();
  if (error || !created) return { error: "Couldn't create the invite. Please try again." };

  const link = `${serverEnv().APP_URL}/invite/${token}`;
  if (invite.email && !invite.phone) {
    const { data: school } = await supabase.from("schools").select("name").eq("id", user.schoolId).single();
    const name = school?.name ?? "DD Busy Bees";
    try {
      await sendEmail({
        to: invite.email,
        subject: `You've been invited to ${name}`,
        ...simpleEmail({
          school: name,
          heading: `Hello ${invite.full_name}`,
          paragraphs: [
            `You've been invited to join ${name} as an office (admin) user.`,
            "Open the link below to choose a password and set up an authenticator app. It works once and expires in 7 days.",
            "If you weren't expecting this, you can ignore this email.",
          ],
          button: { label: "Accept the invite", url: link },
        }),
      });
    } catch {
      await supabase.from("invites").update({ revoked_at: new Date().toISOString() }).eq("id", created.id);
      return { error: `The invite email to ${invite.email} didn't send, so the invite was cancelled. Please try again.` };
    }
    return { success: `Invite emailed to ${invite.email}. The link works once and expires in 7 days.` };
  }
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
