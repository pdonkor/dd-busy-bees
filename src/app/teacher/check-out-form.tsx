"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Input, Select } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

export function CheckOutForm({
  action,
  options,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  options: { name: string; relationship: string | null }[];
}) {
  const [choice, setChoice] = useState("");
  return (
    <ActionForm action={action} className="mt-2 flex flex-wrap items-end gap-2">
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
  );
}
