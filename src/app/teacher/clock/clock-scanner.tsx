"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui";
import { clockScan, type ClockResult } from "./actions";

/** Runs once when the teacher opens the link from the entrance QR code: gets the location, then clocks in or out. */
export function ClockScanner({ code }: { code: string }) {
  const [result, setResult] = useState<ClockResult | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const send = (pos: GeolocationPosition | null) =>
      clockScan({
        code,
        lat: pos?.coords.latitude ?? null,
        lng: pos?.coords.longitude ?? null,
        accuracy: pos?.coords.accuracy ?? null,
      }).then(setResult, () => setResult({ ok: false, message: "That didn't work. Please scan again." }));
    if (!("geolocation" in navigator)) {
      send(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => send(pos),
      () => send(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }, [code]);

  if (!result) return <Alert kind="info">Checking your location…</Alert>;
  return <Alert kind={result.ok ? "success" : "error"}>{result.message}</Alert>;
}
