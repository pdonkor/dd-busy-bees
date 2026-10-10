import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Sends one SMS through Arkesel (a Ghanaian provider). In local development without
 * an API key the message is printed to the server log instead.
 */
export async function sendSms(to: string, message: string): Promise<void> {
  const env = serverEnv();
  if (!env.ARKESEL_API_KEY) {
    // Never fall back to logging in production: messages carry login codes and invite links.
    if (process.env.NODE_ENV === "production") throw new Error("ARKESEL_API_KEY is not set");
    console.info(`[sms:dev] to ${to}: ${message}`);
    return;
  }
  const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method: "POST",
    headers: { "api-key": env.ARKESEL_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      sender: env.SMS_SENDER_ID,
      message,
      recipients: [to.replace(/^\+/, "")],
    }),
  });
  if (!res.ok) {
    throw new Error(`SMS send failed with status ${res.status}`);
  }
}
