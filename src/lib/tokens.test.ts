import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "./tokens";

describe("invite tokens", () => {
  it("are long, URL-safe and unique", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it("hash deterministically and never equal the raw token", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
