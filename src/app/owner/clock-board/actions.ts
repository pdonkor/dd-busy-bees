"use server";

import QRCode from "qrcode";
import { requireRole } from "@/lib/auth";
import { clockCode, windowAt, WINDOW_MS } from "@/lib/clock";
import { serverEnv } from "@/lib/env";

/** The current entrance QR code as an SVG, and how long until it changes. */
export async function currentClockQr(): Promise<{ svg: string; refreshInMs: number } | { error: string }> {
  const user = await requireRole("owner", "admin");
  const env = serverEnv();
  if (!env.CLOCK_QR_SECRET) return { error: "Set CLOCK_QR_SECRET in the hosting settings to turn on clock-in." };
  const now = Date.now();
  const code = clockCode(env.CLOCK_QR_SECRET, user.schoolId, windowAt(now));
  const url = `${env.APP_URL}/teacher/clock?c=${code}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { svg, refreshInMs: WINDOW_MS - (now % WINDOW_MS) + 250 };
}
