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
    })
    .parse(process.env);
}
