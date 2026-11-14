"use client";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold"
    >
      {label}
    </button>
  );
}
