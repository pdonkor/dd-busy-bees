"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Field, Select, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { KIND_LABEL, LOG_KINDS, QUICK_PICKS, STAGES, type LogKind } from "@/lib/log-presets";
import { isNetworkError, queueItem } from "@/lib/offline-queue";
import { logActivity } from "../actions";

type Child = { id: string; name: string; photoConsent: boolean };
type Group = { id: string; name: string; children: Child[] };
type Area = { id: string; name: string; materials: { id: string; name: string }[] };

export function LogForm({ groups, areas, userId }: { groups: Group[]; areas: Area[]; userId: string }) {
  const [kind, setKind] = useState<LogKind>("activity");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [areaId, setAreaId] = useState("");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [photoStatus, setPhotoStatus] = useState("");
  const materials = areas.find((a) => a.id === areaId)?.materials ?? [];
  const noConsent = new Set(groups.flatMap((g) => g.children.filter((c) => !c.photoConsent).map((c) => c.id)));

  // Shrink the photo on the phone before upload: quicker on mobile data and well under the size limit.
  async function onPhoto(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) {
      setHasPhoto(false);
      return;
    }
    setHasPhoto(true);
    // Children without photo consent can't be in a photo.
    setSelected((prev) => new Set([...prev].filter((id) => !noConsent.has(id))));
    try {
      setPhotoStatus("Preparing photo…");
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (blob) {
        const dt = new DataTransfer();
        dt.items.add(new File([blob], "photo.jpg", { type: "image/jpeg" }));
        input.files = dt.files;
      }
      setPhotoStatus("Photo ready.");
    } catch {
      // Older phones: send the original; the server resizes it anyway.
      setPhotoStatus("Photo ready.");
    }
  }

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.filter((id) => !(on && hasPhoto && noConsent.has(id))).forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const names = new Map(groups.flatMap((g) => g.children.map((c) => [c.id, c.name] as const)));

  // With no connection, a log without a photo is kept on the phone and sent later.
  async function submit(prev: ActionState, formData: FormData): Promise<ActionState> {
    try {
      return await logActivity(prev, formData);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (hasPhoto) {
        return { error: "No connection. Photos need a connection: remove the photo to save this log on the phone, or try again later." };
      }
      const children = formData.getAll("children").map(String);
      if (!children.length) return { error: "Choose at least one child." };
      const kind = String(formData.get("kind") ?? "note") as LogKind;
      const field = (k: string) => (formData.get(k) ? String(formData.get(k)) : undefined);
      const who = children.map((id) => names.get(id) ?? "child");
      try {
        await queueItem(userId, {
          type: "log",
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          kind,
          children,
          quick: field("quick"),
          body: field("body"),
          area_id: field("area_id"),
          material_id: field("material_id"),
          stage: field("stage"),
          label: `${KIND_LABEL[kind] ?? "Log"} for ${who.length > 3 ? `${who.slice(0, 3).join(", ")} and ${who.length - 3} more` : who.join(", ")}`,
        });
      } catch {
        return { error: "No connection, and this phone couldn't store the log. Please try again when you're back online." };
      }
      return { success: "No connection, so this log is saved on the phone. It will send by itself when the connection is back." };
    }
  }

  // The note and quick pick clear after each log; the chosen children stay picked for the next one.
  return (
    <ActionForm
      action={submit}
      className="space-y-5"
      onSuccess={() => {
        setHasPhoto(false);
        setPhotoStatus("");
      }}
    >
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
                  {g.children.map((c) => {
                    const blocked = hasPhoto && !c.photoConsent;
                    return (
                      <label
                        key={c.id}
                        title={blocked ? "No photo consent" : undefined}
                        className={`flex min-h-11 items-center rounded-full border px-3 text-sm ${
                          blocked
                            ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400 line-through"
                            : selected.has(c.id)
                              ? "cursor-pointer border-amber-500 bg-amber-100"
                              : "cursor-pointer border-stone-300 bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          name="children"
                          value={c.id}
                          checked={selected.has(c.id)}
                          disabled={blocked}
                          onChange={(e) => toggle([c.id], e.target.checked)}
                          className="sr-only"
                        />
                        {c.name}
                      </label>
                    );
                  })}
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
      <Field label="Photo (optional)" hint={hasPhoto ? "Children without photo consent are greyed out." : undefined}>
        <input
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          onChange={(e) => onPhoto(e.currentTarget)}
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-stone-100 file:px-4 file:font-medium"
        />
        {photoStatus && <span className="mt-1 block text-xs text-stone-600">{photoStatus}</span>}
      </Field>
      <SubmitButton pendingText="Logging…">Log it</SubmitButton>
    </ActionForm>
  );
}
