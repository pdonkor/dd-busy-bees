"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/form-status";
import { Input } from "@/components/ui";
import { isNetworkError, queueItem } from "@/lib/offline-queue";
import { tickTask } from "../actions";

/** The "Done" button for a task. With no connection the tick is kept on the phone and sent later. */
export function TickForm({
  templateId,
  dueDate,
  name,
  userId,
}: {
  templateId: string;
  dueDate: string;
  name: string;
  userId: string;
}) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function tick(formData: FormData) {
    setMessage(null);
    try {
      await tickTask(templateId, dueDate, formData);
    } catch (e) {
      if (!isNetworkError(e)) {
        setMessage({ ok: false, text: "That didn't save. Please try again." });
        return;
      }
      try {
        await queueItem(userId, {
          type: "task",
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          templateId,
          dueDate,
          note: String(formData.get("note") ?? "").trim() || undefined,
          label: `Ticked: ${name}`,
        });
        setMessage({ ok: true, text: "Saved on this phone. It will send when the connection is back." });
      } catch {
        setMessage({ ok: false, text: "No connection, and this phone couldn't store the tick. Try again later." });
      }
    }
  }

  if (message?.ok) return <p className="text-sm text-amber-800">✓ {message.text}</p>;
  return (
    <form action={tick} className="flex flex-wrap items-center gap-2">
      <Input name="note" placeholder="Problem to report? (optional)" maxLength={1000} className="w-auto min-w-56" />
      <SubmitButton pendingText="Ticking…">Done</SubmitButton>
      {message && <p className="w-full text-sm text-red-700">{message.text}</p>}
    </form>
  );
}
