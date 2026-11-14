import { describe, expect, it } from "vitest";
import { dailySummary } from "./summary";

const att = { checked_in_at: "2026-11-16T07:45:00Z", checked_out_at: "2026-11-16T15:30:00Z", collected_by: "Akosua Mensah" };

describe("daily summary SMS", () => {
  it("summarises the day from the logs", () => {
    const text = dailySummary(
      "Ama",
      att,
      [
        { kind: "meal", body: "Ate all", stage: null, occurred_at: "2026-11-16T12:00:00Z", material: null, area: null },
        {
          kind: "activity",
          body: null,
          stage: "practising",
          occurred_at: "2026-11-16T09:00:00Z",
          material: "Pink Tower",
          area: "Sensorial",
        },
      ],
      "https://app.example",
    );
    expect(text).toBe(
      "DD Busy Bees: Ama's day. Arrived 07:45. Worked on: Pink Tower (practising). Meal: Ate all. Collected 15:30 by Akosua Mensah. More: https://app.example/parent",
    );
  });

  it("stays within two SMS pages", () => {
    const logs = Array.from({ length: 30 }, (_, i) => ({
      kind: "activity" as const,
      body: null,
      stage: null,
      occurred_at: `2026-11-16T09:${String(i).padStart(2, "0")}:00Z`,
      material: `Material number ${i}`,
      area: null,
    }));
    const text = dailySummary("Ama", att, logs, "https://app.example");
    expect(text.length).toBeLessThanOrEqual(306);
    expect(text.endsWith("More: https://app.example/parent")).toBe(true);
  });
});
