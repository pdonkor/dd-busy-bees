import { requireRole } from "@/lib/auth";
import { QrBoard } from "./qr-board";

/**
 * Open this on a tablet or old phone at the entrance. Teachers scan it with their
 * own phone camera to clock in and out; the code changes every 30 seconds.
 */
export default async function ClockBoard() {
  await requireRole("owner", "admin");
  return (
    <div className="py-6 text-center">
      <h1 className="text-3xl font-semibold text-stone-900">Staff clock-in</h1>
      <p className="mb-6 mt-2 text-stone-600">Scan with your phone camera when you arrive and when you leave.</p>
      <QrBoard />
      <p className="mt-6 text-xs text-stone-500">The code changes every 30 seconds and only works on the school premises.</p>
    </div>
  );
}
