"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/form-status";
import { Alert, Field, Input } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { acceptInvite } from "./actions";

export function AcceptForm({ token, needsPassword }: { token: string; needsPassword: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(acceptInvite.bind(null, token), undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert>{state.error}</Alert>}
      {needsPassword && (
        <Field label="Choose a password" hint="At least 12 characters. You'll also set up an authenticator app.">
          <Input name="password" type="password" autoComplete="new-password" minLength={12} required />
        </Field>
      )}
      <SubmitButton pendingText="Setting up…">Accept invite</SubmitButton>
    </form>
  );
}
