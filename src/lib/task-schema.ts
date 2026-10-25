import { z } from "zod";

const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(min).max(max).optional());

/** The owner's task form. Fields that don't apply to the chosen frequency are cleared. */
export const taskSchema = z
  .object({
    name: z.string().trim().min(1, "Give the task a name.").max(120),
    instructions: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => v || null),
    frequency: z.enum(["daily", "weekly", "monthly", "termly", "yearly"]),
    weekday: optionalInt(1, 7),
    day_of_month: optionalInt(1, 28),
    month: optionalInt(1, 12),
    assignee_id: z
      .string()
      .optional()
      .transform((v) => v || null)
      .pipe(z.string().uuid().nullable()),
  })
  .transform((v) => ({
    ...v,
    weekday: v.frequency === "weekly" ? (v.weekday ?? null) : null,
    day_of_month: ["monthly", "termly", "yearly"].includes(v.frequency) ? (v.day_of_month ?? null) : null,
    month: v.frequency === "yearly" ? (v.month ?? null) : null,
  }))
  .refine((v) => v.frequency !== "weekly" || v.weekday, { message: "Choose the day of the week." })
  .refine((v) => !["monthly", "termly", "yearly"].includes(v.frequency) || v.day_of_month, {
    message: "Choose the day of the month (1 to 28).",
  })
  .refine((v) => v.frequency !== "yearly" || v.month, { message: "Choose the month." });
