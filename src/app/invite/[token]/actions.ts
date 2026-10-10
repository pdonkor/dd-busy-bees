"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/tokens";

const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters for your password.")
  .max(72, "Use at most 72 characters.");

/**
 * Turns a valid invite into an account. The invite is claimed atomically first, so a
 * link can't be used twice even if it's opened in two tabs at once.
 */
export async function acceptInvite(token: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: invite } = await admin
    .from("invites")
    .update({ accepted_at: now })
    .eq("token_hash", hashToken(token))
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select()
    .maybeSingle();
  if (!invite) return { error: "This invite link has expired or has already been used. Ask the school for a new one." };

  const release = () => admin.from("invites").update({ accepted_at: null }).eq("id", invite.id);

  let password: string | undefined;
  if (invite.email) {
    const parsed = passwordSchema.safeParse(formData.get("password"));
    if (!parsed.success) {
      await release();
      return { error: parsed.error.issues[0].message };
    }
    password = parsed.data;
  }

  // A parent invited for a second child already has an account: reuse it.
  let userId: string | undefined;
  const { data: existing } = await admin
    .from("profiles")
    .select("id, role")
    .eq("school_id", invite.school_id)
    .eq(invite.phone ? "phone" : "email", invite.phone ?? invite.email)
    .maybeSingle();
  if (existing) {
    if (existing.role !== invite.role) {
      await release();
      return { error: "This number or email already has a different kind of account. Please contact the school." };
    }
    userId = existing.id;
  } else {
    const created = await admin.auth.admin.createUser(
      invite.phone
        ? { phone: invite.phone, phone_confirm: true }
        : { email: invite.email, password, email_confirm: true },
    );
    if (created.error || !created.data.user) {
      await release();
      return { error: "We couldn't create your account. It may already exist; please contact the school." };
    }
    userId = created.data.user.id;
    const { error } = await admin.from("profiles").insert({
      id: userId,
      school_id: invite.school_id,
      role: invite.role,
      full_name: invite.full_name,
      phone: invite.phone,
      email: invite.email,
    });
    if (error) {
      await admin.auth.admin.deleteUser(userId);
      await release();
      return { error: "We couldn't finish setting up your account. Please try again." };
    }
  }

  if (invite.role === "teacher" && invite.class_id) {
    await admin
      .from("staff_assignments")
      .upsert({ teacher_id: userId, class_id: invite.class_id, school_id: invite.school_id });
  }
  if (invite.role === "parent" && invite.child_id) {
    await admin.from("guardians").upsert({
      parent_id: userId,
      child_id: invite.child_id,
      school_id: invite.school_id,
      relationship: invite.relationship ?? "parent",
    });
  }
  await admin.from("invites").update({ accepted_by: userId }).eq("id", invite.id);

  redirect(invite.email ? "/login?welcome=1&mode=email" : "/login?welcome=1");
}
