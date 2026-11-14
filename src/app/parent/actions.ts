"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** The parent confirms they have read an incident report (the database checks it's their child). */
export async function acknowledgeIncident(incidentId: string) {
  await requireRole("parent");
  const supabase = await createClient();
  await supabase.rpc("acknowledge_incident", { target: z.string().uuid().parse(incidentId) });
  revalidatePath("/parent");
}
