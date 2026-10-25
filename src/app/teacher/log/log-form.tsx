"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Field, Select, Textarea } from "@/components/ui";
import { LOG_KINDS, QUICK_PICKS, STAGES, type LogKind } from "@/lib/log-presets";
import { logActivity } from "../actions";

type Child = { id: string; name: string };
type Group = { id: string; name: string; children: Child[] };
type Area = { id: string; name: string; materials: { id: string; name: string }[] };

export function LogForm({ groups, areas }: { groups: Group[]; areas: Area[] }) {
  const [kind, setKind] = useState<LogKind>("activity");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [areaId, setAreaId] = useState("");
  const materials = areas.find((a) => a.id === areaId)?.materials ?? [];

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  // The note and quick pick clear after each log; the chosen children stay picked for the next one.
  return (
    <ActionForm action={logActivity} className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-stone-800">Who</legend>
        <div className="space-y-3">
          {groups.map((g) => {
            const ids = g.children.map((c) => c.id);
            const all = ids.length > 0 && ids.every((id) => selected.has(id));
            return (
              <div key={g.id}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-stone-600">{g.name}</span>
                  <button type="button" className="min-h-10 px-2 text-sm text-amber-800 underline" onClick={() => toggle(ids, !all)}>
                    {all ? "Clear" : "Whole class"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.children.map((c) => (
                    <label
                      key={c.id}
                      className={`flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm ${
                        selected.has(c.id) ? "border-amber-500 bg-amber-100" : "border-stone-300 bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="children"
                        value={c.id}
                        checked={selected.has(c.id)}
                        onChange={(e) => toggle([c.id], e.target.checked)}
                        className="sr-only"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-stone-800">What</legend>
        <div className="flex flex-wrap gap-2">
          {LOG_KINDS.map((k) => (
            <label
              key={k.value}
              className={`flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm ${
                kind === k.value ? "border-amber-500 bg-amber-100 font-medium" : "border-stone-300 bg-white"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={k.value}
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
                className="sr-only"
              />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "activity" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Area">
            <Select name="area_id" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">—</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Material">
            <Select name="material_id" defaultValue="" key={areaId} disabled={!materials.length}>
              <option value="">—</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stage">
            <Select name="stage" defaultValue="">
              <option value="">—</option>
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {QUICK_PICKS[kind] && (
        <fieldset key={kind}>
          <legend className="mb-2 text-sm font-medium text-stone-800">Quick pick</legend>
          <div className="flex flex-wrap gap-2">
            {QUICK_PICKS[kind]!.map((q) => (
              <label
                key={q}
                className="flex min-h-11 cursor-pointer items-center rounded-lg border border-stone-300 bg-white px-3 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-100"
              >
                <input type="radio" name="quick" value={q} className="sr-only" />
                {q}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Field label="Note (optional)" hint="Parents of every child tagged will see this.">
        <Textarea name="body" maxLength={2000} />
      </Field>
      <SubmitButton pendingText="Logging…">Log it</SubmitButton>
    </ActionForm>
  );
}
