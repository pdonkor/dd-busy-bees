"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/form-status";
import { Alert, Field, Input } from "@/components/ui";
import { emailLogin, sendPhoneCode, verifyPhoneCode, type LoginState } from "./actions";

export function LoginForm({ defaultMode }: { defaultMode: "phone" | "email" }) {
  const [mode, setMode] = useState(defaultMode);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 rounded-lg bg-stone-100 p-1 text-sm font-medium" role="tablist">
        {(["phone", "email"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-10 rounded-md ${mode === m ? "bg-white shadow-sm" : "text-stone-600"}`}
          >
            {m === "phone" ? "Phone" : "Email (office)"}
          </button>
        ))}
      </div>
      {mode === "phone" ? <PhoneLogin /> : <EmailLogin />}
    </div>
  );
}

function PhoneLogin() {
  const [sendState, send] = useActionState<LoginState, FormData>(sendPhoneCode, { step: "phone" });
  const [verifyState, verify] = useActionState<LoginState, FormData>(verifyPhoneCode, { step: "code" });

  if (sendState.step !== "code") {
    return (
      <form action={send} className="space-y-4">
        {sendState.error && <Alert>{sendState.error}</Alert>}
        <Field label="Mobile number">
          <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="024 123 4567" required />
        </Field>
        <SubmitButton pendingText="Sending code…">Send me a code</SubmitButton>
      </form>
    );
  }

  return (
    <form action={verify} className="space-y-4">
      <input type="hidden" name="phone" value={sendState.phone} />
      {sendState.info && !verifyState.error && <Alert kind="info">{sendState.info}</Alert>}
      {verifyState.error && <Alert>{verifyState.error}</Alert>}
      <Field label="6-digit code">
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Checking…">Log in</SubmitButton>
        <a href="/login" className="text-sm text-stone-600 underline">
          Use a different number
        </a>
      </div>
    </form>
  );
}

function EmailLogin() {
  const [state, action] = useActionState<LoginState, FormData>(emailLogin, { step: "email" });
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
    </form>
  );
}
