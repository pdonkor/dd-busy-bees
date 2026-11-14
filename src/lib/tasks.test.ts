import { describe, expect, it } from "vitest";
import { isDueOn, latestDueDate, taskStates } from "./tasks";

const terms = [1, 5, 9];

describe("isDueOn", () => {
  it("treats daily as Monday to Friday", () => {
    expect(isDueOn({ frequency: "daily" }, "2026-10-23", terms)).toBe(true); // Friday
    expect(isDueOn({ frequency: "daily" }, "2026-10-24", terms)).toBe(false); // Saturday
    expect(isDueOn({ frequency: "daily" }, "2026-10-25", terms)).toBe(false); // Sunday
  });

  it("matches the chosen weekday, including Sunday as 7", () => {
    expect(isDueOn({ frequency: "weekly", weekday: 5 }, "2026-10-23", terms)).toBe(true);
    expect(isDueOn({ frequency: "weekly", weekday: 7 }, "2026-10-25", terms)).toBe(true);
    expect(isDueOn({ frequency: "weekly", weekday: 1 }, "2026-10-25", terms)).toBe(false);
  });

  it("handles monthly, termly and yearly days", () => {
    expect(isDueOn({ frequency: "monthly", day_of_month: 15 }, "2026-02-15", terms)).toBe(true);
    expect(isDueOn({ frequency: "termly", day_of_month: 1 }, "2026-09-01", terms)).toBe(true);
    expect(isDueOn({ frequency: "termly", day_of_month: 1 }, "2026-10-01", terms)).toBe(false);
    expect(isDueOn({ frequency: "yearly", day_of_month: 1, month: 8 }, "2026-08-01", terms)).toBe(true);
    expect(isDueOn({ frequency: "yearly", day_of_month: 1, month: 8 }, "2026-09-01", terms)).toBe(false);
  });
});

describe("latestDueDate", () => {
  it("finds today when due today", () => {
    expect(latestDueDate({ frequency: "daily" }, "2026-10-23", terms)).toBe("2026-10-23");
  });

  it("looks back over the weekend for daily tasks", () => {
    expect(latestDueDate({ frequency: "daily" }, "2026-10-25", terms)).toBe("2026-10-23");
  });

  it("finds the last term start for termly tasks", () => {
    expect(latestDueDate({ frequency: "termly", day_of_month: 7 }, "2026-12-20", terms)).toBe("2026-09-07");
  });
});

describe("taskStates", () => {
  const tasks = [
    { id: "a", frequency: "daily" as const },
    { id: "b", frequency: "weekly" as const, weekday: 1 },
    { id: "c", frequency: "monthly" as const, day_of_month: 15 },
  ];

  it("marks due, done and overdue against the latest due date", () => {
    const states = taskStates(tasks, [{ template_id: "b", due_date: "2026-10-19" }], "2026-10-21", terms);
    expect(states.map((s) => [s.task.id, s.dueDate, s.state])).toEqual([
      ["a", "2026-10-21", "due"],
      ["b", "2026-10-19", "done"],
      ["c", "2026-10-15", "overdue"],
    ]);
  });
});
