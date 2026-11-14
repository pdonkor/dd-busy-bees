import { describe, expect, it } from "vitest";
import { checkPin, hashPin, isValidPin } from "./pin";

describe("pick-up PINs", () => {
  it("rejects weak or malformed PINs", () => {
    expect(isValidPin("2580")).toBe(true);
    expect(isValidPin("1111")).toBe(false);
    expect(isValidPin("1234")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("12345")).toBe(false);
  });

  it("hashes with a salt and checks", () => {
    const a = hashPin("2580");
    expect(a).not.toBe(hashPin("2580"));
    expect(checkPin("2580", a)).toBe(true);
    expect(checkPin("2581", a)).toBe(false);
    expect(checkPin("2580", "garbage")).toBe(false);
  });
});
