"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstIssue, type ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { parseDate, today } from "@/lib/dates";
import { checkPin, MAX_PIN_FAILURES } from "@/lib/pin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSchema } from "@/lib/logs";
import { processPhoto, removePhotos, uploadPhoto } from "@/lib/media";
import { saveLog } from "@/lib/save-log";
import { createClient } from "@/lib/supabase/server";

// As with the owner actions, these run as the logged-in teacher, so row-level
// security limits them to children in the teacher's own classes.

const uuid = z.string().uuid();
const FAILED = "That didn't save. Please try again.";

// Attendance ----------------------------------------------------------------------

export async function checkIn(childId: string) {
  const user = await requireRole("teacher");
  const supabase = await createClient();
  // A unique (child, date) rule makes a second tap harmless.
  await supabase
    .from("attendance")
    .insert({ child_id: uuid.parse(childId), school_id: user.schoolId, checked_in_by: user.id });
  revalidatePath("/teacher");
}

const OTHER = "__other__";

export async function checkOut(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const id = uuid.parse(childId);
  const choice = String(formData.get("collected_by") ?? "");
  const other = String(formData.get("other_name") ?? "").trim().slice(0, 120);
  if (!choice) return { error: "Choose who is collecting the child." };
  if (choice === OTHER && !other) return { error: "Type the name of the person collecting the child." };

  const supabase = await createClient();
  // Check the name against the list on the server so the "not on the list" flag can't be skipped.
  const { data: options } = await supabase.rpc("pickup_options", { target_child: id });
  const listed = choice !== OTHER && (options ?? []).some((o: { name: string }) => o.name === choice);
  const name = choice === OTHER ? other : choice;

  const { error, count } = await supabase
    .from("attendance")
    .update(
      {
        checked_out_at: new Date().toISOString(),
        checked_out_by: user.id,
        collected_by: name,
        collected_by_unlisted: !listed,
      },
      { count: "exact" },
    )
    .eq("child_id", id)
    .eq("date", today())
    .is("checked_out_at", null);
  if (error || !count) return { error: FAILED };
  revalidatePath("/teacher");
  return {
    success: listed ? `Collected by ${name}.` : `Collected by ${name}. They aren't on the pick-up list, so the office has been told.`,
  };
}

/**
 * The parent types their PIN on the teacher's phone. A match signs the child out
 * as collected by that parent. Wrong PINs are counted per child per day and lock
 * PIN check-out after a few tries, so it can't be guessed.
 */
export async function checkOutWithPin(childId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const id = uuid.parse(childId);
  const pin = String(formData.get("pin") ?? "");
  if (!/^\d{4}$/.test(pin)) return { error: "Ask the parent to type their 4-digit PIN." };

  // Row-level security confirms this teacher looks after the child before anything else is read.
  const supabase = await createClient();
  const { data: child } = await supabase.from("children").select("id").eq("id", id).maybeSingle();
  if (!child) return { error: FAILED };

  const admin = createAdminClient();
  const date = today();
  const { data: attempts } = await admin
    .from("pickup_pin_attempts")
    .select("failures")
    .eq("child_id", id)
    .eq("date", date)
    .maybeSingle();
  if ((attempts?.failures ?? 0) >= MAX_PIN_FAILURES) {
    return { error: "Too many wrong PINs today. Choose the person from the list instead." };
  }
  const { data: guardians } = await admin
    .from("guardians")
    .select("parent_id, profiles!inner(full_name, active)")
    .eq("child_id", id)
    .eq("can_pick_up", true)
    .eq("profiles.active", true);
  const parentIds = (guardians ?? []).map((g) => g.parent_id);
  const { data: pins } = parentIds.length
    ? await admin.from("pickup_pins").select("parent_id, pin_hash").in("parent_id", parentIds)
    : { data: [] };
  const matchPin = (pins ?? []).find((p) => checkPin(pin, p.pin_hash));
  const match = matchPin && guardians?.find((g) => g.parent_id === matchPin.parent_id);
  if (!match) {
    await admin
      .from("pickup_pin_attempts")
      .upsert({ child_id: id, date, failures: (attempts?.failures ?? 0) + 1 });
    return { error: "That PIN isn't right. Ask them to try again." };
  }
  const name = (match.profiles as unknown as { full_name: string }).full_name;
  const { error, count } = await supabase
    .from("attendance")
    .update(
      {
        checked_out_at: new Date().toISOString(),
        checked_out_by: user.id,
        collected_by: name,
        collected_by_unlisted: false,
      },
      { count: "exact" },
    )
    .eq("child_id", id)
    .eq("date", date)
    .is("checked_out_at", null);
  if (error || !count) return { error: FAILED };
  revalidatePath("/teacher");
  return { success: `PIN correct. Collected by ${name}.` };
}

// Activity logs -------------------------------------------------------------------

export async function logActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const photoField = formData.get("photo");
  const photoFile = photoField instanceof File && photoField.size > 0 ? photoField : null;
  const parsed = logSchema.safeParse({
    has_photo: !!photoFile,
    kind: formData.get("kind"),
    children: formData.getAll("children"),
    quick: formData.get("quick") ?? undefined,
    body: formData.get("body") ?? undefined,
    area_id: formData.get("area_id") ?? undefined,
    material_id: formData.get("material_id") ?? undefined,
    stage: formData.get("stage") ?? undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const childIds = parsed.data.children;
  const supabase = await createClient();

  let photo: { full: Buffer; thumb: Buffer } | null = null;
  if (photoFile) {
    // Photos may only show children whose parents agreed to photos.
    const { data: kids } = await supabase.from("children").select("first_name, photo_consent").in("id", childIds);
    const noConsent = (kids ?? []).filter((k) => !k.photo_consent).map((k) => k.first_name);
    if (noConsent.length) {
      return { error: `${noConsent.join(", ")} can't be in photos (no photo consent). Untick them or remove the photo.` };
    }
    try {
      photo = await processPhoto(photoFile);
    } catch {
      return { error: "That photo couldn't be used. Try another, or a smaller one." };
    }
  }

  // Choose the id here so the children can be tagged without reading the log back.
  const logId = crypto.randomUUID();
  if ((await saveLog(supabase, user, parsed.data, { id: logId })) !== "saved") return { error: FAILED };

  if (photo) {
    const mediaId = crypto.randomUUID();
    const path = `${user.schoolId}/${logId}/${mediaId}.jpg`;
    const thumbPath = `${user.schoolId}/${logId}/${mediaId}_thumb.jpg`;
    try {
      await uploadPhoto(path, photo.full);
      await uploadPhoto(thumbPath, photo.thumb);
      const { error: mediaError } = await supabase
        .from("media")
        .insert({ id: mediaId, school_id: user.schoolId, log_id: logId, path, thumb_path: thumbPath });
      if (mediaError) throw mediaError;
    } catch {
      await removePhotos([path, thumbPath]);
      await supabase.from("activity_logs").delete().eq("id", logId);
      return { error: "The photo didn't upload. Please try again." };
    }
  }

  revalidatePath("/teacher/log");
  const n = childIds.length;
  return { success: `Logged for ${n} ${n === 1 ? "child" : "children"}${photo ? " with a photo" : ""}.` };
}

export async function deleteLog(logId: string) {
  await requireRole("teacher");
  const id = uuid.parse(logId);
  const supabase = await createClient();
  const { data: media } = await supabase.from("media").select("path, thumb_path").eq("log_id", id);
  const { data: deleted } = await supabase.from("activity_logs").delete().eq("id", id).select("id");
  // Only remove the files once the database agreed this teacher may delete the log.
  if (deleted?.length) await removePhotos((media ?? []).flatMap((m) => [m.path, m.thumb_path]));
  revalidatePath("/teacher/log");
}

// Maintenance tasks ---------------------------------------------------------------

export async function tickTask(templateId: string, dueDate: string, formData: FormData) {
  const user = await requireRole("teacher");
  const date = parseDate(dueDate);
  if (!date) return;
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;
  const supabase = await createClient();
  await supabase.from("task_completions").insert({
    template_id: uuid.parse(templateId),
    school_id: user.schoolId,
    due_date: date,
    done_by: user.id,
    note,
  });
  revalidatePath("/teacher/tasks");
}

export async function untickTask(completionId: string) {
  await requireRole("teacher");
  const supabase = await createClient();
  await supabase.from("task_completions").delete().eq("id", uuid.parse(completionId));
  revalidatePath("/teacher/tasks");
}
