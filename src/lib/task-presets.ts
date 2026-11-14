import type { TaskSchedule } from "./tasks";

export type TaskPreset = TaskSchedule & { name: string; instructions?: string };

/**
 * A starter list of upkeep checks for a nursery in Ghana. The owner adds them in
 * one go and then edits, reassigns or removes whatever doesn't fit.
 */
export const GHANA_STARTER_TASKS: TaskPreset[] = [
  // Every school day
  { name: "Toilets cleaned and stocked", instructions: "Water, soap and tissue in every toilet; floors dry.", frequency: "daily" },
  { name: "Handwashing station filled", instructions: "Veronica bucket or tap has water and soap.", frequency: "daily" },
  { name: "Drinking water checked", instructions: "Dispenser or sachets in date and covered.", frequency: "daily" },
  { name: "Compound walk-round", instructions: "No broken glass, sharp objects, open gutters or stagnant water.", frequency: "daily" },
  { name: "Close-up check", instructions: "Gate locked, windows shut, fans, lights and sockets off.", frequency: "daily" },
  // Weekly
  { name: "Clear drains and standing water", instructions: "Empty containers and clear gutters so mosquitoes can't breed.", frequency: "weekly", weekday: 5 },
  { name: "Disinfect toys and materials", frequency: "weekly", weekday: 5 },
  { name: "Check first aid box", instructions: "Plasters, gauze, gloves, antiseptic, ORS and thermometer present and in date.", frequency: "weekly", weekday: 1 },
  { name: "Food store check", instructions: "No pests, food sealed, nothing past its date.", frequency: "weekly", weekday: 3 },
  // Monthly
  { name: "Generator test run", instructions: "Run for 15 minutes and check fuel and oil.", frequency: "monthly", day_of_month: 1 },
  { name: "Fire extinguisher gauges", instructions: "Needle in the green, pin and seal in place, easy to reach.", frequency: "monthly", day_of_month: 1 },
  { name: "Water tank (polytank) covered and clean", frequency: "monthly", day_of_month: 15 },
  { name: "Sockets, cables and fans", instructions: "Report loose sockets, exposed wires or wobbly ceiling fans.", frequency: "monthly", day_of_month: 15 },
  { name: "Window nets and mosquito screens", instructions: "Report holes or gaps.", frequency: "monthly", day_of_month: 15 },
  // Each term
  { name: "Pest control / fumigation booked", frequency: "termly", day_of_month: 1 },
  { name: "Playground equipment safety check", instructions: "Rust, loose bolts, splinters, hot metal surfaces in the sun.", frequency: "termly", day_of_month: 1 },
  { name: "Deep-clean water storage tank", frequency: "termly", day_of_month: 7 },
  { name: "Emergency contacts up to date", instructions: "Phone numbers for parents, clinic, fire service and police.", frequency: "termly", day_of_month: 7 },
  // Yearly
  { name: "Roof and gutters before the rains", instructions: "Fix leaks and clear gutters before the main rainy season.", frequency: "yearly", day_of_month: 1, month: 3 },
  { name: "Fire extinguishers serviced", instructions: "Service and refill by an approved fire service provider.", frequency: "yearly", day_of_month: 1, month: 8 },
  { name: "Electrical inspection", frequency: "yearly", day_of_month: 1, month: 8 },
];
