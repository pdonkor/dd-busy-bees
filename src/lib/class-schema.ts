import { z } from "zod";

/** A blank number field arrives as "" and means "not set", not 0. */
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().pipe(schema).optional());

export const classSchema = z
  .object({
    name: z.string().trim().max(80).min(1, "Give the class a name."),
    capacity: optionalNumber(z.number().int("Places must be a whole number.").min(1).max(200)),
    min_age_years: optionalNumber(z.number().min(0).max(12)),
    max_age_years: optionalNumber(z.number().min(0).max(12)),
  })
  .refine((v) => v.min_age_years === undefined || v.max_age_years === undefined || v.min_age_years <= v.max_age_years, {
    message: "The youngest age must be below the oldest age.",
  });

export function classRow(data: z.infer<typeof classSchema>) {
  return {
    name: data.name,
    capacity: data.capacity ?? null,
    min_age_months: data.min_age_years === undefined ? null : Math.round(data.min_age_years * 12),
    max_age_months: data.max_age_years === undefined ? null : Math.round(data.max_age_years * 12),
  };
}
