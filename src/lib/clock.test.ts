import { describe, expect, it } from "vitest";
import { clockCode, distanceMetres, minutesLate, onPremises, verifyClockCode, WINDOW_MS } from "./clock";

const secret = "x".repeat(40);
const school = "a0000000-0000-0000-0000-000000000001";

describe("clock codes", () => {
  it("accepts the current and previous window only", () => {
    const now = 1_800_000_000_000;
    const code = clockCode(secret, school, Math.floor(now / WINDOW_MS));
    expect(verifyClockCode(secret, school, code, now)).toBe(true);
    expect(verifyClockCode(secret, school, code, now + WINDOW_MS)).toBe(true);
    expect(verifyClockCode(secret, school, code, now + 2 * WINDOW_MS)).toBe(false);
  });

  it("is tied to the school and the secret", () => {
    const now = Date.now();
    const code = clockCode(secret, school, Math.floor(now / WINDOW_MS));
    expect(verifyClockCode(secret, "b0000000-0000-0000-0000-000000000001", code, now)).toBe(false);
    expect(verifyClockCode("y".repeat(40), school, code, now)).toBe(false);
    expect(verifyClockCode(secret, school, "short", now)).toBe(false);
  });
});

describe("location", () => {
  it("measures distance", () => {
    // About 111 m per 0.001 degree of latitude.
    const d = distanceMetres({ lat: 5.6, lng: -0.2 }, { lat: 5.601, lng: -0.2 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(117);
  });

  it("allows for GPS accuracy but not wild fixes", () => {
    expect(onPremises(250, 60, 200)).toBe(true);
    expect(onPremises(350, 60, 200)).toBe(false);
    expect(onPremises(250, 900, 200)).toBe(false);
  });
});

describe("lateness", () => {
  it("counts minutes past the grace period", () => {
    expect(minutesLate("2026-11-16T07:05:00Z", "07:00", 10)).toBe(0);
    expect(minutesLate("2026-11-16T07:25:00Z", "07:00:00", 10)).toBe(25);
  });
});
