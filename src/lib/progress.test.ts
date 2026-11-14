import { describe, expect, it } from "vitest";
import { draftReport, progressByArea, type ProgressLog } from "./progress";

const sensorial = { id: "s", name: "Sensorial", position: 1 };
const maths = { id: "m", name: "Mathematics", position: 2 };
const tower = { id: "t", name: "Pink Tower", position: 1 };
const stair = { id: "b", name: "Brown Stair", position: 2 };
const beads = { id: "g", name: "Golden Beads", position: 1 };

const logs: ProgressLog[] = [
  { occurred_at: "2026-10-01T09:00:00Z", stage: "presented", area: sensorial, material: tower },
  { occurred_at: "2026-10-08T09:00:00Z", stage: "mastered", area: sensorial, material: tower },
  { occurred_at: "2026-10-15T09:00:00Z", stage: "practising", area: sensorial, material: tower },
  { occurred_at: "2026-10-02T09:00:00Z", stage: "practising", area: sensorial, material: stair },
  { occurred_at: "2026-10-03T09:00:00Z", stage: null, area: maths, material: beads },
  { occurred_at: "2026-10-03T09:00:00Z", stage: null, area: null, material: null },
];

describe("progress", () => {
  it("keeps the furthest stage per material, ordered as the owner set the curriculum", () => {
    const areas = progressByArea(logs);
    expect(areas.map((a) => a.name)).toEqual(["Sensorial", "Mathematics"]);
    expect(areas[0].materials).toEqual([
      { id: "t", name: "Pink Tower", stage: "mastered", lastSeen: "2026-10-15T09:00:00Z", times: 3 },
      { id: "b", name: "Brown Stair", stage: "practising", lastSeen: "2026-10-02T09:00:00Z", times: 1 },
    ]);
  });

  it("drafts a report from the term's work", () => {
    const text = draftReport({ firstName: "Ama", termName: "Term 1", areas: progressByArea(logs), daysAttended: 52, notes: [] });
    expect(text).toContain("Ama attended 52 days this term.");
    expect(text).toContain("Ama has mastered Pink Tower. Ama is practising Brown Stair.");
    expect(text).toContain("Ama has been introduced to Golden Beads.");
  });
});
