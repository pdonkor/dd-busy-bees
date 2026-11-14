"use client";

import { useState } from "react";

/** Fills the latitude and longitude fields from this device, for use while standing at the school. */
export function LocationButton() {
  const [status, setStatus] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="min-h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium"
        onClick={() => {
          setStatus("Finding location…");
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const set = (name: string, value: number) => {
                const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
                if (el) el.value = value.toFixed(6);
              };
              set("latitude", pos.coords.latitude);
              set("longitude", pos.coords.longitude);
              setStatus(`Found (accurate to about ${Math.round(pos.coords.accuracy)} m). Press Save to keep it.`);
            },
            () => setStatus("Couldn't get the location. Allow location access and try again."),
            { enableHighAccuracy: true, timeout: 20_000 },
          );
        }}
      >
        Use this device&apos;s location
      </button>
      <span className="text-xs text-stone-600">{status}</span>
    </div>
  );
}
