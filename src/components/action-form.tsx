"use client";

import { useActionState, type ReactNode } from "react";
import { Alert } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { CopyLink } from "./copy-link";

/** A form wired to a server action that shows its error, success message and any invite link. */
export function ActionForm({
  action,
  children,
  className = "space-y-3",
  resetOnSuccess = true,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className} key={resetOnSuccess && state?.success ? state.success : undefined}>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert kind="success">{state.success}</Alert>}
      {state?.link && <CopyLink link={state.link} />}
      {children}
    </form>
  );
}
