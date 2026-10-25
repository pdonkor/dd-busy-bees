// Quick choices for the logging screen so teachers tap rather than type.

export type LogKind = "activity" | "meal" | "nap" | "toilet" | "mood" | "note";
export type Stage = "presented" | "practising" | "mastered";

export const LOG_KINDS: { value: LogKind; label: string }[] = [
  { value: "activity", label: "Activity" },
  { value: "meal", label: "Meal" },
  { value: "nap", label: "Nap" },
  { value: "toilet", label: "Toilet" },
  { value: "mood", label: "Mood" },
  { value: "note", label: "Note" },
];

export const QUICK_PICKS: Partial<Record<LogKind, string[]>> = {
  meal: ["Ate all", "Ate most", "Ate a little", "Didn't eat"],
  nap: ["Slept well", "Rested but didn't sleep", "Short nap"],
  toilet: ["Used the toilet", "Nappy changed", "Accident, clothes changed"],
  mood: ["Happy", "Calm", "Tired", "Upset"],
};

export const STAGES: { value: Stage; label: string }[] = [
  { value: "presented", label: "Presented" },
  { value: "practising", label: "Practising" },
  { value: "mastered", label: "Mastered" },
];

export const KIND_LABEL = Object.fromEntries(LOG_KINDS.map((k) => [k.value, k.label])) as Record<LogKind, string>;
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.value, s.label])) as Record<Stage, string>;
