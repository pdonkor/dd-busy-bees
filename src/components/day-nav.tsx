import Link from "next/link";
import { addDays, formatDay, today } from "@/lib/dates";

/** Previous / next day links for pages that take a ?date= parameter. */
export function DayNav({ basePath, date }: { basePath: string; date: string }) {
  const isToday = date === today();
  return (
    <div className="mb-4 flex items-center justify-between gap-2 text-sm">
      <Link href={`${basePath}?date=${addDays(date, -1)}`} className="min-h-10 px-2 py-2 text-amber-800 underline">
        ← Previous day
      </Link>
      <span className="font-medium">{isToday ? "Today" : formatDay(date)}</span>
      {isToday ? (
        <span className="w-24" />
      ) : (
        <Link href={`${basePath}?date=${addDays(date, 1)}`} className="min-h-10 px-2 py-2 text-amber-800 underline">
          Next day →
        </Link>
      )}
    </div>
  );
}
