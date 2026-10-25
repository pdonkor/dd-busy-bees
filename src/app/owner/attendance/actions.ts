"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Removes a check-in made by mistake. Only owner and admin may, and the audit log keeps a copy. */
export async function deleteAttendance(attendanceId: string) {
  await requireRole("owner", "admin");
  const supabase = await createClient();
  await supabase.from("attendance").delete().eq("id", z.string().uuid().parse(attendanceId));
  revalidatePath("/owner/attendance");
  revalidatePath("/owner");
}
