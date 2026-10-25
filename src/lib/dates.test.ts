import { describe, expect, it } from "vitest";
import { addDays, parseDate, today } from "./dates";

describe("dates", () => {
  it("rejects anything that isn't a real date", () => {
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("26-1-1")).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate("2026-02-28")).toBe("2026-02-28");
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("uses the Accra (UTC) calendar day", () => {
    expect(today(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-25");
  });
});
