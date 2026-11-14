"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Input, Select } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Check-out either by the parent typing their PIN, or by choosing who collected from the list. */
export function CheckOutForm({
  action,
  pinAction,
  options,
}: {
  action: Action;
  pinAction: Action;
  options: { name: string; relationship: string | null }[];
}) {
  const [mode, setMode] = useState<"pin" | "list">("pin");
  const [choice, setChoice] = useState("");
  return (
    <div className="mt-2">
      <div className="mb-1 flex gap-3 text-xs">
        <button
          type="button"
          onClick={() => setMode("pin")}
          className={`min-h-9 underline ${mode === "pin" ? "font-semibold text-stone-900" : "text-stone-500"}`}
        >
          Parent PIN
        </button>
        <button
          type="button"
          onClick={() => setMode("list")}
          className={`min-h-9 underline ${mode === "list" ? "font-semibold text-stone-900" : "text-stone-500"}`}
        >
          Choose from list
        </button>
      </div>
      {mode === "pin" ? (
        <ActionForm action={pinAction} className="flex flex-wrap items-end gap-2">
          <Input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            placeholder="Parent types PIN"
            aria-label="Parent's PIN"
            autoComplete="off"
            required
            className="w-44"
          />
          <SubmitButton variant="secondary">Check out</SubmitButton>
        </ActionForm>
      ) : (
        <ActionForm action={action} className="flex flex-wrap items-end gap-2">
          <Select
            name="collected_by"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="w-auto min-w-48"
            aria-label="Collected by"
            required
          >
            <option value="">Collected by…</option>
            {options.map((o) => (
              <option key={o.name} value={o.name}>
                {o.name}
                {o.relationship ? ` (${o.relationship})` : ""}
              </option>
            ))}
            <option value="__other__">Someone not on the list</option>
          </Select>
          {choice === "__other__" && (
            <Input name="other_name" placeholder="Their full name" maxLength={120} required className="w-auto min-w-48" />
          )}
          <SubmitButton variant="secondary">Check out</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
