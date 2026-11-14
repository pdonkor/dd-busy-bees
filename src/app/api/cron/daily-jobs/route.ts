import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { today } from "@/lib/dates";
import { serverEnv } from "@/lib/env";
import { generateTermInvoices, sendFeeReminders } from "@/lib/fees";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs every morning (see vercel.json):
 *  - issues termly invoices once a term has started, if nobody has done it by hand;
 *  - on Mondays, sends SMS reminders for overdue balances (at most one a week per family).
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  const date = today();
  const isMonday = new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
  const result: Record<string, unknown> = {};

  const { data: terms } = await admin
    .from("terms")
    .select("id, school_id, name")
    .lte("starts_on", date)
    .gte("ends_on", date)
    .is("invoices_generated_at", null);
  for (const t of terms ?? []) {
    result[`invoices:${t.name}`] = await generateTermInvoices(admin, t.school_id, t.id, null);
  }

  if (isMonday) {
    const { data: schools } = await admin.from("schools").select("id");
    for (const s of schools ?? []) {
      result[`reminders:${s.id}`] = await sendFeeReminders(admin, s.id, `week:${date}`, serverEnv().APP_URL, date);
    }
  }
  return NextResponse.json(result);
}
