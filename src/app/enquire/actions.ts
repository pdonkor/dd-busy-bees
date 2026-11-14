"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { firstIssue, type ActionState } from "@/lib/action-state";
import { serverEnv } from "@/lib/env";
import { normaliseGhanaPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/tokens";

const enquirySchema = z.object({
  parent_name: z.string().trim().min(1, "Enter your name.").max(120),
  relationship: z.string().trim().max(40).optional(),
  phone: z.string().transform((v, ctx) => {
    const p = normaliseGhanaPhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Enter a Ghana mobile number, for example 024 123 4567." });
      return z.NEVER;
    }
    return p;
  }),
  email: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null)
    .pipe(z.string().email("Check the email address.").nullable()),
  child_first_name: z.string().trim().min(1, "Enter your child's first name.").max(80),
  child_last_name: z.string().trim().min(1, "Enter your child's surname.").max(80),
  child_dob: z.string().date("Enter your child's date of birth."),
  start_date: z
    .string()
    .transform((v) => v || null)
    .pipe(z.string().date().nullable()),
  sessions: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
});

async function passesBotCheck(token: string | null, ip: string): Promise<boolean> {
  const secret = serverEnv().TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  }).catch(() => null);
  const body = await res?.json().catch(() => null);
  return !!body?.success;
}

async function publicSchoolId(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const configured = serverEnv().PUBLIC_SCHOOL_ID;
  if (configured) return configured;
  const { data } = await admin.from("schools").select("id").limit(2);
  return data?.length === 1 ? data[0].id : null;
}

/**
 * The public enquiry form. No login: it writes through the server with a bot check,
 * a hidden honeypot field and a limit of three enquiries an hour from one address.
 */
export async function submitEnquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const thanks = { success: "Thank you! We've received your enquiry and will call you soon to arrange a visit." };
  // Bots fill in every field, including this hidden one; pretend all is well.
  if (String(formData.get("website") ?? "")) return thanks;

  const parsed = enquirySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const h = await headers();
  // Vercel sets x-real-ip itself, so a visitor can't fake it to dodge the hourly limit.
  const ip = h.get("x-real-ip")?.trim() || (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await passesBotCheck(String(formData.get("cf-turnstile-response") ?? "") || null, ip))) {
    return { error: "Please complete the check that you're not a robot." };
  }

  const admin = createAdminClient();
  const ipHash = hashToken(`enquiry:${ip}`);
  const { count } = await admin
    .from("enquiries")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= 3) return { error: "We've had several enquiries from you already. Please call the school instead." };

  const schoolId = await publicSchoolId(admin);
  if (!schoolId) return { error: "Enquiries aren't open yet. Please call the school." };
  const { error } = await admin.from("enquiries").insert({
    ...parsed.data,
    relationship: parsed.data.relationship || null,
    sessions: parsed.data.sessions || null,
    message: parsed.data.message || null,
    school_id: schoolId,
    ip_hash: ipHash,
  });
  if (error) return { error: "That didn't send. Please try again." };
  return thanks;
}
