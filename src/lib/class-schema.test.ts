import { describe, expect, it } from "vitest";
import { classRow, classSchema } from "./class-schema";

describe("class form", () => {
  it("treats blank number fields as not set", () => {
    const parsed = classSchema.parse({ name: "Bees", capacity: "", min_age_years: "", max_age_years: "" });
    expect(classRow(parsed)).toEqual({ name: "Bees", capacity: null, min_age_months: null, max_age_months: null });
  });

  it("converts ages in years to months", () => {
    const parsed = classSchema.parse({ name: "Bees", capacity: "20", min_age_years: "2.5", max_age_years: "4" });
    expect(classRow(parsed)).toEqual({ name: "Bees", capacity: 20, min_age_months: 30, max_age_months: 48 });
  });

  it("accepts an age of zero", () => {
    expect(classSchema.parse({ name: "Babies", min_age_years: "0" }).min_age_years).toBe(0);
  });

  it("rejects an age range the wrong way round and a missing name", () => {
    expect(classSchema.safeParse({ name: "Bees", min_age_years: "5", max_age_years: "3" }).success).toBe(false);
    expect(classSchema.safeParse({ name: " " }).success).toBe(false);
  });
});
