"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstIssue, type ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { normaliseGhanaPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

// Parents complete their own child's enrolment pack. Each write is checked again in
// the database: a parent can only touch children linked to them by the school.

const uuid = z.string().uuid();
const FAILED = "That didn't save. Please try again.";

export async function submitEnrolment(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("parent");
  const text = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const doctorPhone = text("doctor_phone", 30);
  if (doctorPhone && !/^[+\d\s()-]{6,30}$/.test(doctorPhone)) return { error: "Check the doctor's phone number." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_enrolment", {
    target_child: uuid.parse(childId),
    p_allergies: text("allergies", 2000),
    p_medical_notes: text("medical_notes", 2000),
    p_doctor_name: text("doctor_name", 120),
    p_doctor_phone: doctorPhone,
    p_photo_consent: formData.get("photo_consent") === "on",
    p_outings_consent: formData.get("outings_consent") === "on",
  });
  if (error) return { error: FAILED };
  revalidatePath(`/parent/child/${childId}`);
  return { success: "Thank you, the school now has these details." };
}

const personSchema = z.object({
  full_name: z.string().trim().min(1, "Enter their name.").max(120),
  phone: z.string().transform((v, ctx) => {
    const p = normaliseGhanaPhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Enter a Ghana mobile number, for example 024 123 4567." });
      return z.NEVER;
    }
    return p;
  }),
  relationship: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null),
});

export async function addEmergencyContact(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("parent");
  const parsed = personSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("emergency_contacts")
    .insert({ ...parsed.data, child_id: uuid.parse(childId), school_id: user.schoolId });
  if (error) return { error: FAILED };
  revalidatePath(`/parent/child/${childId}`);
  return { success: `Added ${parsed.data.full_name}.` };
}

export async function removeEmergencyContact(childId: string, contactId: string) {
  await requireRole("parent");
  const supabase = await createClient();
  await supabase.from("emergency_contacts").delete().eq("id", uuid.parse(contactId)).eq("child_id", uuid.parse(childId));
  revalidatePath(`/parent/child/${childId}`);
}

export async function requestPickup(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("parent");
  const parsed = personSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("authorised_pickups").insert({
    ...parsed.data,
    child_id: uuid.parse(childId),
    school_id: user.schoolId,
    approved: false,
    requested_by: user.id,
  });
  if (error) return { error: FAILED };
  revalidatePath(`/parent/child/${childId}`);
  return { success: `Asked the school to add ${parsed.data.full_name}. They can collect once the office approves.` };
}
