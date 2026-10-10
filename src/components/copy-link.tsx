"use client";

import { useState } from "react";

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2">
      <code className="flex-1 break-all text-xs text-stone-700">{link}</code>
      <button
        type="button"
        className="min-h-10 rounded-md bg-white px-3 text-sm font-medium shadow-sm"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
