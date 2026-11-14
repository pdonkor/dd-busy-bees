"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { hashPin, isValidPin } from "@/lib/pin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Sets the parent's 4-digit pick-up PIN. Stored only as a salted hash. */
export async function setPickupPin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("parent");
  const pin = String(formData.get("pin") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!isValidPin(pin)) return { error: "Choose 4 digits that aren't easy to guess (not 1111 or 1234)." };
  if (pin !== confirm) return { error: "The two PINs don't match." };
  const { error } = await createAdminClient()
    .from("pickup_pins")
    .upsert({ parent_id: user.id, school_id: user.schoolId, pin_hash: hashPin(pin), updated_at: new Date().toISOString() });
  if (error) return { error: "That didn't save. Please try again." };
  revalidatePath("/parent/account");
  return { success: "PIN saved. Type it on the teacher's phone when you collect your child." };
}

export async function setDailySms(enabled: boolean) {
  await requireRole("parent");
  const supabase = await createClient();
  await supabase.rpc("set_daily_sms", { enabled });
  revalidatePath("/parent/account");
}
