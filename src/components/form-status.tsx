"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant}>
      {pending ? pendingText : children}
    </Button>
  );
}
