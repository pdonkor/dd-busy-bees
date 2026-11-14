import { describe, expect, it } from "vitest";
import { taskSchema } from "./task-schema";

describe("taskSchema", () => {
  it("clears fields that don't apply to the frequency", () => {
    const parsed = taskSchema.parse({ name: "Sweep", frequency: "daily", weekday: "3", day_of_month: "5", assignee_id: "" });
    expect(parsed).toMatchObject({ weekday: null, day_of_month: null, month: null, assignee_id: null, instructions: null });
  });

  it("requires the day for weekly, monthly and yearly tasks", () => {
    expect(taskSchema.safeParse({ name: "x", frequency: "weekly", weekday: "" }).success).toBe(false);
    expect(taskSchema.safeParse({ name: "x", frequency: "monthly" }).success).toBe(false);
    expect(taskSchema.safeParse({ name: "x", frequency: "yearly", day_of_month: "1" }).success).toBe(false);
    expect(taskSchema.parse({ name: "x", frequency: "yearly", day_of_month: "1", month: "8" })).toMatchObject({
      day_of_month: 1,
      month: 8,
    });
  });

  it("rejects days past the 28th", () => {
    expect(taskSchema.safeParse({ name: "x", frequency: "monthly", day_of_month: "31" }).success).toBe(false);
  });
});
