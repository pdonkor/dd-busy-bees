import type { Stage } from "@/lib/log-presets";

export type ProgressLog = {
  occurred_at: string;
  stage: Stage | null;
  area: { id: string; name: string; position: number } | null;
  material: { id: string; name: string; position: number } | null;
};

export type MaterialProgress = { id: string; name: string; stage: Stage | null; lastSeen: string; times: number };
export type AreaProgress = { id: string; name: string; materials: MaterialProgress[] };

const RANK: Record<Stage, number> = { presented: 1, practising: 2, mastered: 3 };

/**
 * Each curriculum area with the materials a child has worked with and how far they
 * got. A material's stage is the furthest stage logged (a later "practising" after
 * "mastered" doesn't undo mastery).
 */
export function progressByArea(logs: ProgressLog[]): AreaProgress[] {
  const areas = new Map<string, { area: ProgressLog["area"] & object; materials: Map<string, MaterialProgress & { position: number }> }>();
  for (const l of logs) {
    if (!l.area || !l.material) continue;
    const entry = areas.get(l.area.id) ?? { area: l.area, materials: new Map() };
    const m: MaterialProgress & { position: number } = entry.materials.get(l.material.id) ?? {
      id: l.material.id,
      name: l.material.name,
      position: l.material.position,
      stage: null,
      lastSeen: l.occurred_at,
      times: 0,
    };
    m.times++;
    if (l.occurred_at > m.lastSeen) m.lastSeen = l.occurred_at;
    if (l.stage && (!m.stage || RANK[l.stage] > RANK[m.stage])) m.stage = l.stage;
    entry.materials.set(l.material.id, m);
    areas.set(l.area.id, entry);
  }
  return [...areas.values()]
    .sort((a, b) => a.area.position - b.area.position || a.area.name.localeCompare(b.area.name))
    .map(({ area, materials }) => ({
      id: area.id,
      name: area.name,
      materials: [...materials.values()]
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
        .map(({ position: _p, ...m }) => m),
    }));
}

/**
 * A first draft of a termly report, written from the term's logs so the teacher
 * checks and edits rather than writing from scratch.
 */
export function draftReport(input: {
  firstName: string;
  termName: string;
  areas: AreaProgress[];
  daysAttended: number;
  notes: string[];
}): string {
  const { firstName, termName, areas, daysAttended } = input;
  const lines: string[] = [`${firstName}'s report, ${termName}`, ""];
  lines.push(`${firstName} attended ${daysAttended} ${daysAttended === 1 ? "day" : "days"} this term.`, "");
  if (!areas.length) {
    lines.push(`No curriculum work was logged for ${firstName} this term.`);
  }
  for (const area of areas) {
    const mastered = area.materials.filter((m) => m.stage === "mastered").map((m) => m.name);
    const practising = area.materials.filter((m) => m.stage === "practising").map((m) => m.name);
    const presented = area.materials.filter((m) => m.stage === "presented" || !m.stage).map((m) => m.name);
    lines.push(area.name);
    const parts: string[] = [];
    if (mastered.length) parts.push(`${firstName} has mastered ${list(mastered)}.`);
    if (practising.length) parts.push(`${firstName} is practising ${list(practising)}.`);
    if (presented.length) parts.push(`${firstName} has been introduced to ${list(presented)}.`);
    lines.push(parts.join(" "), "");
  }
  lines.push("General comments", "[Add a few sentences about how the term went, friendships and next steps.]");
  return lines.join("\n");
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
