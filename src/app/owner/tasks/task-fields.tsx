"use client";

import { useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FREQUENCY_LABELS, MONTHS, WEEKDAYS, type Frequency } from "@/lib/tasks";

export type TaskValues = {
  name: string;
  instructions: string | null;
  frequency: Frequency;
  weekday: number | null;
  day_of_month: number | null;
  month: number | null;
  assignee_id: string | null;
};

export function TaskFields({
  task,
  staff,
}: {
  task?: TaskValues;
  staff: { id: string; full_name: string }[];
}) {
  const [frequency, setFrequency] = useState<Frequency>(task?.frequency ?? "daily");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Task">
        <Input name="name" required maxLength={120} defaultValue={task?.name} placeholder="e.g. Check fire extinguisher" />
      </Field>
      <Field label="Who does it">
        <Select name="assignee_id" defaultValue={task?.assignee_id ?? ""}>
          <option value="">Any teacher</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="How often">
        <Select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
          {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      {frequency === "weekly" && (
        <Field label="Day">
          <Select name="weekday" defaultValue={task?.weekday ?? 1}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {(frequency === "monthly" || frequency === "termly" || frequency === "yearly") && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day of month" hint={frequency === "termly" ? "In the month each term starts" : "1 to 28"}>
            <Input name="day_of_month" type="number" min={1} max={28} required defaultValue={task?.day_of_month ?? 1} />
          </Field>
          {frequency === "yearly" && (
            <Field label="Month">
              <Select name="month" defaultValue={task?.month ?? 1}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
      <div className="sm:col-span-2">
        <Field label="What to check (optional)">
          <Textarea name="instructions" maxLength={2000} defaultValue={task?.instructions ?? ""} rows={2} />
        </Field>
      </div>
    </div>
  );
}
