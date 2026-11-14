// Service worker: lets teachers open the app and log while the network is down.
// - App code (/_next/static) is cached the first time it loads; those files never change.
// - Teacher pages are fetched from the network first and kept as a fallback for when
//   there's no connection. Logs made offline are queued by the page itself (IndexedDB)
//   and sent when the connection returns.
// - Nothing else (owner and parent pages, data, photos) is ever cached.
// - Logging out deletes the cached pages.

const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC, PAGES];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head>
<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#1c1917">
<h1 style="font-size:1.25rem">No connection</h1>
<p>This page hasn't been opened on this phone before, so it can't be shown offline.</p>
<p><a href="/teacher/log">Log activity</a> and <a href="/teacher/tasks">My tasks</a> work offline once you've opened them with a connection.</p>
</body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method === "POST" && url.pathname === "/logout") {
    event.waitUntil(caches.delete(PAGES));
    return;
  }
  if (req.method !== "GET") return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  if (req.mode === "navigate" && (url.pathname === "/teacher" || url.pathname.startsWith("/teacher/"))) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        try {
          const res = await fetch(req);
          // Only keep real teacher pages, never a redirect to the login page.
          if (res.ok && !res.redirected && res.type === "basic") cache.put(url.pathname, res.clone());
          return res;
        } catch {
          return (
            (await cache.match(url.pathname)) ??
            new Response(OFFLINE_HTML, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } })
          );
        }
      })(),
    );
  }
});
