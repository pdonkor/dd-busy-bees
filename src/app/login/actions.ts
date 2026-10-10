"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { normaliseGhanaPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { step: "phone" | "code" | "email"; phone?: string; error?: string; info?: string };

export async function sendPhoneCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const phone = normaliseGhanaPhone(String(formData.get("phone") ?? ""));
  if (!phone) return { step: "phone", error: "Enter a Ghana mobile number, for example 024 123 4567." };

  const supabase = await createClient();
  // shouldCreateUser: false keeps the app invite-only. The response is the same whether or
  // not the number has an account, so the form can't be used to discover who is registered.
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
  if (error?.status === 429) {
    return { step: "phone", error: "Too many codes requested. Please wait a few minutes and try again." };
  }
  // Unknown numbers also return an error here; log the rest so delivery problems are visible.
  if (error && error.status !== 400 && error.status !== 422) console.error("send code failed", error.status, error.message);
  return { step: "code", phone, info: "If this number has an account, we've sent it a 6-digit code." };
}

export async function verifyPhoneCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const phone = normaliseGhanaPhone(String(formData.get("phone") ?? ""));
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!phone) return { step: "phone", error: "Enter your mobile number again." };
  if (!/^\d{6}$/.test(token)) return { step: "code", phone, error: "Enter the 6-digit code from the SMS." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) {
    return {
      step: "code",
      phone,
      error: error.status === 429 ? "Too many attempts. Please wait a few minutes." : "That code is wrong or has expired.",
    };
  }
  redirect("/");
}

const emailSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function emailLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { step: "email", error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      step: "email",
      error: error.status === 429 ? "Too many attempts. Please wait and try again." : "Email or password is wrong.",
    };
  }
  redirect("/mfa");
}
