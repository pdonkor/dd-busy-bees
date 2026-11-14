import type { OfflineItem } from "@/lib/logs";

// Logs and task ticks saved on the teacher's phone while offline, in IndexedDB, so
// they survive the page closing or the phone restarting. Each teacher has their own
// queue, so on a shared phone one teacher's logs are never sent under another's name.
// Browser-only.

const DB = "busy-bees-offline";
const STORE = "queue";
const CHANGED = "offline-queue-changed";

function open(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`${DB}-${userId}`, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  userId: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  const db = await open(userId);
  try {
    return await new Promise<T | void>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function queueItem(userId: string, item: OfflineItem): Promise<void> {
  await run(userId, "readwrite", (s) => s.put(item));
  window.dispatchEvent(new Event(CHANGED));
}

export async function queuedItems(userId: string): Promise<OfflineItem[]> {
  const items = ((await run(userId, "readonly", (s) => s.getAll())) ?? []) as OfflineItem[];
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

export async function removeItems(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await run(userId, "readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
  window.dispatchEvent(new Event(CHANGED));
}

export function onQueueChange(fn: () => void): () => void {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}

/**
 * True when a server action failed because the request never got an answer (no
 * network, or the connection dropped), as opposed to the server saying no.
 */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return e instanceof TypeError || (e instanceof Error && /fetch|network|load failed/i.test(e.message));
}
