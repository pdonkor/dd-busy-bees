"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { distanceMetres, onPremises, verifyClockCode } from "@/lib/clock";
import { today } from "@/lib/dates";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ClockResult = { ok: boolean; message: string };

const scanSchema = z.object({
  code: z.string().min(10).max(64),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracy: z.number().min(0).nullable(),
});

/**
 * Clocks the teacher in (first scan of the day) or out (second scan). The shift is
 * written with the service role only after the rotating code and the phone's
 * location have been checked here, so it can't be faked through the API.
 */
export async function clockScan(input: z.input<typeof scanSchema>): Promise<ClockResult> {
  const user = await requireRole("teacher");
  const parsed = scanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That code didn't scan properly. Please scan again." };
  const { code, lat, lng, accuracy } = parsed.data;

  const secret = serverEnv().CLOCK_QR_SECRET;
  if (!secret) return { ok: false, message: "Clock-in isn't set up yet. Please tell the office." };
  if (!verifyClockCode(secret, user.schoolId, code)) {
    return { ok: false, message: "That code has expired. Scan the code on the screen at the entrance again." };
  }

  const supabase = await createClient();
  const { data: school } = await supabase.from("schools").select("latitude, longitude, geofence_m").single();
  let distance: number | null = null;
  if (school?.latitude != null && school?.longitude != null) {
    if (lat == null || lng == null || accuracy == null) {
      return { ok: false, message: "Allow location on your phone so the app can check you're at school." };
    }
    distance = Math.round(distanceMetres({ lat, lng }, { lat: school.latitude, lng: school.longitude }));
    if (!onPremises(distance, accuracy, school.geofence_m)) {
      return { ok: false, message: "Your phone doesn't seem to be at school. Move closer to the entrance and try again." };
    }
  }

  const admin = createAdminClient();
  const date = today();
  const { data: shift } = await admin
    .from("staff_shifts")
    .select("id, clock_in_at, clock_out_at")
    .eq("staff_id", user.id)
    .eq("date", date)
    .maybeSingle();

  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });
  if (!shift) {
    const { error } = await admin
      .from("staff_shifts")
      .insert({ school_id: user.schoolId, staff_id: user.id, date, in_distance_m: distance });
    if (error) return { ok: false, message: "That didn't save. Please scan again." };
    revalidatePath("/teacher");
    return { ok: true, message: `Clocked in at ${time}. Have a good day!` };
  }
  if (shift.clock_out_at) return { ok: false, message: "You've already clocked out today." };
  // A second scan within 5 minutes is almost always a double scan, not a clock-out.
  if (Date.now() - new Date(shift.clock_in_at).getTime() < 5 * 60_000) {
    return { ok: true, message: "You're already clocked in." };
  }
  const { error } = await admin
    .from("staff_shifts")
    .update({ clock_out_at: new Date().toISOString(), out_distance_m: distance })
    .eq("id", shift.id)
    .is("clock_out_at", null);
  if (error) return { ok: false, message: "That didn't save. Please scan again." };
  revalidatePath("/teacher");
  return { ok: true, message: `Clocked out at ${time}. Thank you!` };
}
