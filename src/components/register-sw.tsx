"use client";

import { useEffect } from "react";

/** Registers the service worker (public/sw.js) that keeps teacher pages usable offline. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
