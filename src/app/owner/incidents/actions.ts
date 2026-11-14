"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function signOffIncident(incidentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("owner", "admin");
  const note = String(formData.get("owner_note") ?? "").trim().slice(0, 2000) || null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("incidents")
    .update({ owner_signoff_at: new Date().toISOString(), owner_note: note })
    .eq("id", z.string().uuid().parse(incidentId));
  if (error) return { error: "That didn't save. Please try again." };
  revalidatePath("/owner/incidents");
  revalidatePath("/owner");
  return { success: "Signed off." };
}
