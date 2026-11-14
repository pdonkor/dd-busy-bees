"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstIssue, type ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const time = z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 07:30.");

const rotaSchema = z
  .object({
    staff_id: z.string().uuid("Choose a staff member."),
    weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Pick at least one day."),
    starts_at: time,
    ends_at: time,
  })
  .refine((v) => v.ends_at > v.starts_at, { message: "The finish time must be after the start time." });

/** Sets the planned hours for one staff member on the chosen weekdays. */
export async function saveRota(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner", "admin");
  const parsed = rotaSchema.safeParse({
    staff_id: formData.get("staff_id"),
    weekdays: formData.getAll("weekdays"),
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { staff_id, weekdays, starts_at, ends_at } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_rota")
    .upsert(weekdays.map((weekday) => ({ staff_id, weekday, starts_at, ends_at, school_id: user.schoolId })));
  if (error) return { error: "That didn't save. Please try again." };
  revalidatePath("/owner/staff-time");
  return { success: "Rota saved." };
}

export async function removeRotaDay(staffId: string, weekday: number) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase
    .from("staff_rota")
    .delete()
    .eq("staff_id", z.string().uuid().parse(staffId))
    .eq("weekday", z.number().int().min(1).max(7).parse(weekday));
  revalidatePath("/owner/staff-time");
}

/** The office records a clock-out for someone who forgot to scan on the way out. */
export async function closeShift(shiftId: string, formData: FormData) {
  const user = await requireRole("owner", "admin");
  const t = time.safeParse(formData.get("time"));
  if (!t.success) return;
  const supabase = await createClient();
  const { data: shift } = await supabase
    .from("staff_shifts")
    .select("date")
    .eq("id", z.string().uuid().parse(shiftId))
    .single();
  if (!shift) return;
  await supabase
    .from("staff_shifts")
    .update({ clock_out_at: `${shift.date}T${t.data}:00Z`, corrected_by: user.id })
    .eq("id", shiftId);
  revalidatePath("/owner/staff-time");
}
