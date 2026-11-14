"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui";
import { currentClockQr } from "./actions";

/** Shows the entrance QR code and swaps it for a new one every 30 seconds. */
export function QrBoard() {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const load = async () => {
      try {
        const res = await currentClockQr();
        if (stopped) return;
        if ("error" in res) {
          setError(res.error);
          return;
        }
        setError(null);
        setSvg(res.svg);
        timer = setTimeout(load, res.refreshInMs);
      } catch {
        // Network blip: try again shortly.
        if (!stopped) timer = setTimeout(load, 5_000);
      }
    };
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!svg) return <p className="text-stone-500">Loading…</p>;
  // The SVG comes from our own server (the qrcode library), not from user input.
  return <div className="mx-auto w-full max-w-md" dangerouslySetInnerHTML={{ __html: svg }} />;
}
