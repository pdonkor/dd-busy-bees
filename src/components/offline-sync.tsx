"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { syncOffline } from "@/app/teacher/offline-actions";
import type { OfflineItem } from "@/lib/logs";
import { onQueueChange, queuedItems, removeItems } from "@/lib/offline-queue";

/**
 * Sends logs and task ticks saved on the phone while offline, as soon as there is a
 * connection: on page load, when the phone comes back online, and every 30 seconds.
 * Shows what is still waiting, and anything the school's system refused.
 */
export function OfflineSync({ userId }: { userId: string }) {
  const router = useRouter();
  const [waiting, setWaiting] = useState<OfflineItem[]>([]);
  const [refused, setRefused] = useState<string[]>([]);
  const [online, setOnline] = useState(true);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setWaiting(await queuedItems(userId));
    } catch {
      // IndexedDB unavailable (private browsing on some phones): nothing can be queued either.
    }
  }, [userId]);

  const sync = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    try {
      const items = await queuedItems(userId);
      let saved = false;
      for (let i = 0; i < items.length; i += 50) {
        const batch = items.slice(i, i + 50);
        const results = await syncOffline(batch);
        const done = results.map((r) => r.id);
        const rejected = results.filter((r) => r.status === "rejected");
        if (rejected.length) {
          const labels = new Map(batch.map((b) => [b.id, b.label]));
          setRefused((prev) => [...prev, ...rejected.map((r) => `${labels.get(r.id) ?? "An entry"}: ${r.error ?? "not saved"}`)]);
        }
        saved ||= results.some((r) => r.status === "saved");
        await removeItems(userId, done);
      }
      if (saved) router.refresh();
    } catch {
      // Still offline, or the request dropped: everything stays queued for the next try.
    } finally {
      busy.current = false;
      await refresh();
    }
  }, [refresh, router, userId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh().then(sync);
    const up = () => {
      setOnline(true);
      void sync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const stop = onQueueChange(() => void refresh());
    const timer = setInterval(() => void sync(), 30_000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      stop();
      clearInterval(timer);
    };
  }, [refresh, sync]);

  if (!waiting.length && !refused.length && online) return null;
  return (
    <div className="mb-4 space-y-2 print:hidden" role="status">
      {!online && !waiting.length && (
        <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700">
          No connection. You can still log (without photos) and tick tasks; they&apos;ll send later.
        </p>
      )}
      {waiting.length > 0 && (
        <details className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <summary className="cursor-pointer">
            {waiting.length} saved on this phone, {online ? "sending…" : "waiting for a connection"}
          </summary>
          <ul className="mt-2 list-disc pl-5">
            {waiting.map((w) => (
              <li key={w.id}>
                {w.label} <span className="text-amber-700">({new Date(w.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})</span>
              </li>
            ))}
          </ul>
          {online && (
            <button type="button" onClick={() => void sync()} className="mt-2 min-h-10 underline">
              Send now
            </button>
          )}
        </details>
      )}
      {refused.length > 0 && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-medium">These weren&apos;t saved:</p>
          <ul className="list-disc pl-5">
            {refused.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <button type="button" onClick={() => setRefused([])} className="mt-1 min-h-10 underline">
            OK
          </button>
        </div>
      )}
    </div>
  );
}
