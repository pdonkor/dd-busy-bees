"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { firstIssue, type ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { today } from "@/lib/dates";
import { serverEnv } from "@/lib/env";
import { sendBatch } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  child_id: z.string().uuid("Choose the child."),
  kind: z.enum(["accident", "incident", "illness"]),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Enter the time it happened."),
  description: z.string().trim().min(5, "Describe what happened.").max(4000),
  action_taken: z
    .string()
    .trim()
    .max(4000)
    .transform((v) => v || null),
});

/**
 * Records an incident. The app (not the teacher) then texts the child's parents to
 * open the report and acknowledge it; teachers still can't message anyone.
 */
export async function reportIncident(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { child_id, kind, time, description, action_taken } = parsed.data;
  const occurred = `${today()}T${time}:00Z`;
  if (occurred > new Date().toISOString()) return { error: "The time can't be later than now." };

  const supabase = await createClient();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("incidents").insert({
    id,
    school_id: user.schoolId,
    child_id,
    kind,
    occurred_at: occurred,
    description,
    action_taken,
    reported_by: user.id,
  });
  if (error) return { error: "That didn't save. Please try again." };

  const admin = createAdminClient();
  const [{ data: child }, { data: guardians }] = await Promise.all([
    admin.from("children").select("first_name").eq("id", child_id).single(),
    admin
      .from("guardians")
      .select("parent_id, profiles!inner(phone, active)")
      .eq("child_id", child_id)
      .eq("profiles.active", true)
      .not("profiles.phone", "is", null),
  ]);
  const word = kind === "illness" ? "felt unwell" : `had ${kind === "accident" ? "an accident" : "an incident"}`;
  await sendBatch(
    admin,
    (guardians ?? []).map((g) => ({
      schoolId: user.schoolId,
      kind: "incident",
      dedupeKey: `incident:${id}:${g.parent_id}`,
      to: (g.profiles as unknown as { phone: string }).phone,
      message: `DD Busy Bees: ${child?.first_name ?? "Your child"} ${word} at school today. Please read the report in the app and tap to acknowledge: ${serverEnv().APP_URL}/parent`,
      recipientId: g.parent_id,
      childId: child_id,
    })),
  ).catch(() => undefined);
  redirect("/teacher?incident=1");
}
