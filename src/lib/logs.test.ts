import { describe, expect, it } from "vitest";
import { clampOfflineTime, logSchema, MAX_OFFLINE_AGE_MS } from "./logs";

const now = Date.parse("2026-11-14T12:00:00Z");
const child = "3f2b8c1e-4d5a-4e6f-9a7b-1c2d3e4f5a6b";

describe("offline logs", () => {
  it("keeps the phone's time within the last three days", () => {
    expect(clampOfflineTime("2026-11-14T09:30:00Z", now)).toBe("2026-11-14T09:30:00.000Z");
    expect(clampOfflineTime("2026-11-15T09:30:00Z", now)).toBe("2026-11-14T12:00:00.000Z");
    expect(clampOfflineTime("2026-01-01T00:00:00Z", now)).toBe(new Date(now - MAX_OFFLINE_AGE_MS).toISOString());
    expect(clampOfflineTime("nonsense", now)).toBe("2026-11-14T12:00:00.000Z");
    expect(clampOfflineTime(undefined, now)).toBe("2026-11-14T12:00:00.000Z");
  });

  it("accepts the same logs as the online form", () => {
    const ok = logSchema.safeParse({ kind: "meal", children: [child, child], quick: "Ate all", has_photo: false });
    expect(ok.success && ok.data.children).toEqual([child]);
    expect(logSchema.safeParse({ kind: "meal", children: [child], has_photo: false }).success).toBe(false);
    expect(logSchema.safeParse({ kind: "meal", children: [], body: "x", has_photo: false }).success).toBe(false);
    const nonActivity = logSchema.safeParse({ kind: "nap", children: [child], body: "slept", area_id: child, has_photo: false });
    expect(nonActivity.success && nonActivity.data.area_id).toBeNull();
  });
});
