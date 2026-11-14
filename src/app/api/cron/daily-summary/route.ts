import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { dayRange, today } from "@/lib/dates";
import { serverEnv } from "@/lib/env";
import type { LogKind, Stage } from "@/lib/log-presets";
import { sendBatch, type OutgoingSms } from "@/lib/notify";
import { dailySummary, type SummaryLog } from "@/lib/summary";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs at 4 pm on school days (see vercel.json). Every parent who wants it gets one
 * SMS per child who was at school today, built from the teachers' logs.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  const date = today();
  const { start, end } = dayRange(date);

  const { data: attendance } = await admin
    .from("attendance")
    .select("school_id, child_id, checked_in_at, checked_out_at, collected_by, children!inner(first_name, status)")
    .eq("date", date)
    .eq("children.status", "active");
  if (!attendance?.length) return NextResponse.json({ sent: 0 });
  const childIds = attendance.map((a) => a.child_id);

  const [{ data: tags }, { data: guardians }] = await Promise.all([
    admin
      .from("activity_children")
      .select("child_id, activity_logs!inner(kind, body, stage, occurred_at, curriculum_areas(name), materials(name))")
      .in("child_id", childIds)
      .gte("activity_logs.occurred_at", start)
      .lt("activity_logs.occurred_at", end),
    admin
      .from("guardians")
      .select("child_id, parent_id, profiles!inner(phone, active, daily_sms)")
      .in("child_id", childIds)
      .eq("profiles.active", true)
      .eq("profiles.daily_sms", true)
      .not("profiles.phone", "is", null),
  ]);

  const logsByChild = new Map<string, SummaryLog[]>();
  for (const t of tags ?? []) {
    const l = t.activity_logs as unknown as {
      kind: LogKind;
      body: string | null;
      stage: Stage | null;
      occurred_at: string;
      curriculum_areas: { name: string } | null;
      materials: { name: string } | null;
    };
    const list = logsByChild.get(t.child_id) ?? [];
    list.push({ ...l, area: l.curriculum_areas?.name ?? null, material: l.materials?.name ?? null });
    logsByChild.set(t.child_id, list);
  }

  const appUrl = serverEnv().APP_URL;
  const messages: OutgoingSms[] = [];
  for (const a of attendance) {
    const firstName = (a.children as unknown as { first_name: string }).first_name;
    const text = dailySummary(firstName, a, logsByChild.get(a.child_id) ?? [], appUrl);
    for (const g of (guardians ?? []).filter((g) => g.child_id === a.child_id)) {
      const phone = (g.profiles as unknown as { phone: string }).phone;
      messages.push({
        schoolId: a.school_id,
        kind: "daily_summary",
        dedupeKey: `summary:${a.child_id}:${g.parent_id}:${date}`,
        to: phone,
        message: text,
        recipientId: g.parent_id,
        childId: a.child_id,
      });
    }
  }
  return NextResponse.json(await sendBatch(admin, messages));
}
