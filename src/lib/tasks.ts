// When maintenance tasks fall due. "Daily" means every school day (Monday to
// Friday); the other frequencies fall on the day the owner picked.

export type Frequency = "daily" | "weekly" | "monthly" | "termly" | "yearly";

export type TaskSchedule = {
  frequency: Frequency;
  weekday?: number | null; // ISO: 1 Monday … 7 Sunday
  day_of_month?: number | null;
  month?: number | null;
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Every school day",
  weekly: "Weekly",
  monthly: "Monthly",
  termly: "Each term",
  yearly: "Yearly",
};

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parts(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return { weekday, day: d.getUTCDate(), month: d.getUTCMonth() + 1 };
}

/** Whether a task with this schedule is due on the given "YYYY-MM-DD" date. */
export function isDueOn(task: TaskSchedule, date: string, termStartMonths: number[]): boolean {
  const { weekday, day, month } = parts(date);
  switch (task.frequency) {
    case "daily":
      return weekday <= 5;
    case "weekly":
      return weekday === task.weekday;
    case "monthly":
      return day === task.day_of_month;
    case "termly":
      return day === task.day_of_month && termStartMonths.includes(month);
    case "yearly":
      return day === task.day_of_month && month === task.month;
  }
}

/** The most recent date on or before `date` when the task was due, looking back up to a year. */
export function latestDueDate(task: TaskSchedule, date: string, termStartMonths: number[]): string | null {
  const d = new Date(`${date}T00:00:00Z`);
  for (let i = 0; i <= 366; i++) {
    const candidate = d.toISOString().slice(0, 10);
    if (isDueOn(task, candidate, termStartMonths)) return candidate;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return null;
}

export function describeSchedule(task: TaskSchedule): string {
  switch (task.frequency) {
    case "daily":
      return "Every school day";
    case "weekly":
      return `Every ${WEEKDAYS[(task.weekday ?? 1) - 1]}`;
    case "monthly":
      return `Monthly on day ${task.day_of_month}`;
    case "termly":
      return `Each term on day ${task.day_of_month} of the first month`;
    case "yearly":
      return `Every year on ${task.day_of_month} ${MONTHS[(task.month ?? 1) - 1]}`;
  }
}

export type TaskState = "due" | "overdue" | "done";

/**
 * Where each task stands today: due today, done (for its latest due date), or
 * overdue (its latest due date has passed without a tick). Tasks that have never
 * fallen due are left out.
 */
export function taskStates<T extends TaskSchedule & { id: string }, C extends { template_id: string; due_date: string }>(
  tasks: T[],
  completions: C[],
  date: string,
  termStartMonths: number[],
): { task: T; dueDate: string; state: TaskState; completion?: C }[] {
  return tasks.flatMap((task) => {
    const dueDate = latestDueDate(task, date, termStartMonths);
    if (!dueDate) return [];
    const completion = completions.find((c) => c.template_id === task.id && c.due_date === dueDate);
    const state: TaskState = completion ? "done" : dueDate === date ? "due" : "overdue";
    return [{ task, dueDate, state, completion }];
  });
}
