import { describe, expect, it } from "vitest";
import { normaliseGhanaPhone } from "./phone";

describe("normaliseGhanaPhone", () => {
  it.each([
    ["0241234567", "+233241234567"],
    ["024 123 4567", "+233241234567"],
    ["+233 24 123 4567", "+233241234567"],
    ["233501234567", "+233501234567"],
    ["241234567", "+233241234567"],
    ["(020) 123-4567", "+233201234567"],
  ])("accepts %s", (input, expected) => {
    expect(normaliseGhanaPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "0311234567", "+44 7700 900123", "02412345678", "abc"])("rejects %s", (input) => {
    expect(normaliseGhanaPhone(input)).toBeNull();
  });
});
