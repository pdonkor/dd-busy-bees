import { createHmac, timingSafeEqual } from "node:crypto";

// The clock-in QR code at the entrance changes every 30 seconds. Each code is an
// HMAC of the school and the 30-second window, so it can't be guessed, and a
// photo of it stops working within a minute.

export const WINDOW_MS = 30_000;

export function windowAt(now: number): number {
  return Math.floor(now / WINDOW_MS);
}

export function clockCode(secret: string, schoolId: string, window: number): string {
  return createHmac("sha256", secret).update(`clock:${schoolId}:${window}`).digest("base64url").slice(0, 22);
}

/** True if the code matches the current window or the one before (a minute of grace for slow scans). */
export function verifyClockCode(secret: string, schoolId: string, code: string, now = Date.now()): boolean {
  const w = windowAt(now);
  const given = Buffer.from(code);
  return [w, w - 1].some((win) => {
    const expected = Buffer.from(clockCode(secret, schoolId, win));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

/** Distance in metres between two points (haversine). */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Whether a phone's reported position counts as on the premises. GPS accuracy is
 * added up to 100 m so a weak indoor fix doesn't lock someone out, but a
 * position as vague as a whole neighbourhood is refused.
 */
export function onPremises(distance: number, accuracy: number, geofence: number): boolean {
  if (!Number.isFinite(accuracy) || accuracy > 500) return false;
  return distance <= geofence + Math.min(accuracy, 100);
}

/** Minutes late against the planned start ("HH:MM[:SS]"), or 0 if within the grace period. Accra time = UTC. */
export function minutesLate(clockIn: string, plannedStart: string, graceMin: number): number {
  const t = new Date(clockIn);
  const [h, m] = plannedStart.split(":").map(Number);
  const start = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), h, m);
  const late = Math.floor((t.getTime() - start) / 60_000);
  return late > graceMin ? late : 0;
}
