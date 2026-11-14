import { z } from "zod";

// Shared by the log form (online) and the offline sync, so both accept exactly the same logs.

const uuid = z.string().uuid();

export const logSchema = z
  .object({
    kind: z.enum(["activity", "meal", "nap", "toilet", "mood", "note"]),
    children: z.array(uuid).min(1, "Choose at least one child.").max(60),
    quick: z.string().trim().max(200).optional(),
    body: z.string().trim().max(2000).optional(),
    area_id: z.string().optional(),
    material_id: z.string().optional(),
    stage: z.enum(["presented", "practising", "mastered", ""]).optional(),
    has_photo: z.boolean(),
  })
  .transform((v) => {
    const isActivity = v.kind === "activity";
    const body = [v.quick, v.body].filter(Boolean).join(". ") || null;
    return {
      kind: v.kind,
      children: [...new Set(v.children)],
      body,
      area_id: isActivity && v.area_id ? v.area_id : null,
      material_id: isActivity && v.material_id ? v.material_id : null,
      stage: isActivity && v.stage ? v.stage : null,
      has_photo: v.has_photo,
    };
  })
  // A photo on its own is enough of a log.
  .refine((v) => v.body || v.material_id || v.area_id || v.has_photo, { message: "Add a note or choose what they did." })
  .refine((v) => [v.area_id, v.material_id].every((x) => x === null || uuid.safeParse(x).success), {
    message: "Please choose from the list.",
  });

export type ParsedLog = z.output<typeof logSchema>;

/** How long a log or tick may sit on a phone and still be accepted with its original time. */
export const MAX_OFFLINE_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The time to record for something done while offline: the phone's time, but never in
 * the future and never older than three days (a wrong phone clock can't backdate logs).
 */
export function clampOfflineTime(at: string | undefined, now = Date.now()): string {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return new Date(now).toISOString();
  return new Date(Math.min(now, Math.max(now - MAX_OFFLINE_AGE_MS, t))).toISOString();
}

/** An item saved on a teacher's phone while offline, waiting to be sent. */
export type OfflineItem =
  | {
      type: "log";
      /** Chosen on the phone, so sending the same log twice saves it once. */
      id: string;
      at: string;
      kind: string;
      children: string[];
      quick?: string;
      body?: string;
      area_id?: string;
      material_id?: string;
      stage?: string;
      /** Shown in the queue, e.g. "Meal for Ama, Kofi". */
      label: string;
    }
  | { type: "task"; id: string; at: string; templateId: string; dueDate: string; note?: string; label: string };

export type SyncResult = { id: string; status: "saved" | "duplicate" | "rejected"; error?: string };
