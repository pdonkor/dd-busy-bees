import { Webhook } from "standardwebhooks";
import { serverEnv } from "@/lib/env";
import { sendSms } from "@/lib/sms";

/**
 * Supabase Auth "Send SMS" hook: Supabase calls this with the one-time login code and
 * we deliver it through our Ghanaian SMS provider. The request is signed by Supabase
 * and rejected unless the signature checks out.
 */
export async function POST(request: Request) {
  const secret = serverEnv().SEND_SMS_HOOK_SECRET;
  if (!secret) return Response.json({ error: "hook not configured" }, { status: 500 });

  const payload = await request.text();
  let event: { user: { phone: string }; sms: { otp: string } };
  try {
    const webhook = new Webhook(secret.replace(/^v1,whsec_/, ""));
    event = webhook.verify(payload, Object.fromEntries(request.headers)) as typeof event;
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  try {
    await sendSms(
      event.user.phone,
      `Your DD Busy Bees login code is ${event.sms.otp}. It expires in 10 minutes. Never share this code.`,
    );
  } catch {
    return Response.json({ error: { http_code: 502, message: "Could not send SMS" } }, { status: 502 });
  }
  return Response.json({});
}
