"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstIssue, type ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const optionalNumber = (schema: z.ZodNumber) =>
  z
    .string()
    .transform((v) => (v.trim() === "" ? null : Number(v)))
    .pipe(schema.nullable());

const schoolSchema = z.object({
  name: z.string().trim().min(1, "Enter the school's name.").max(120),
  address: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
  latitude: optionalNumber(z.number().min(-90).max(90)),
  longitude: optionalNumber(z.number().min(-180).max(180)),
  geofence_m: z.coerce.number().int().min(50, "Use at least 50 metres.").max(2000),
  late_after_min: z.coerce.number().int().min(0).max(120),
});

/** School details and clock-in settings. Only the owner may change these (the database enforces it too). */
export async function saveSchool(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("owner");
  const parsed = schoolSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if ((parsed.data.latitude == null) !== (parsed.data.longitude == null)) {
    return { error: "Set both latitude and longitude, or clear both." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("schools").update(parsed.data).eq("id", user.schoolId);
  if (error) return { error: "That didn't save. Please try again." };
  revalidatePath("/owner", "layout");
  return { success: "Saved." };
}
