import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Supabase settings that are safe to send to the browser. */
export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/** Secrets that must only ever be read on the server. */
export function serverEnv() {
  return z
    .object({
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
      APP_URL: z.string().url(),
      SEND_SMS_HOOK_SECRET: z.string().optional(),
      ARKESEL_API_KEY: z.string().optional(),
      SMS_SENDER_ID: z.string().max(11).default("BusyBees"),
      // Signs the rotating clock-in QR code. Any random string of 32+ characters.
      CLOCK_QR_SECRET: z.string().min(32).optional(),
      // Vercel Cron sends this as a bearer token to the scheduled jobs.
      CRON_SECRET: z.string().min(16).optional(),
      // Paystack secret key (sk_test_… or sk_live_…); it also verifies webhook signatures.
      PAYSTACK_SECRET_KEY: z.string().optional(),
      // Paystack needs an email address; parents without one get <phone>@<this domain>.
      PAYSTACK_PLACEHOLDER_EMAIL_DOMAIN: z.string().default("parents.ddbusybees.com"),
      // Resend (resend.com) for receipt and office-invite emails. Optional in development.
      RESEND_API_KEY: z.string().optional(),
      // The From address; its domain must be verified in Resend.
      EMAIL_FROM: z.string().min(3).default("DD Busy Bees <office@ddbusybees.com>"),
      // Cloudflare Turnstile bot check on the public enquiry form (optional).
      TURNSTILE_SECRET_KEY: z.string().optional(),
      // Which school the public enquiry form belongs to; defaults to the only school.
      PUBLIC_SCHOOL_ID: z.string().uuid().optional(),
    })
    .parse(process.env);
}
