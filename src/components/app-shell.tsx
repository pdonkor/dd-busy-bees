import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({
  nav,
  userName,
  children,
}: {
  nav: { href: string; label: string }[];
  userName: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold text-amber-700">
            DD Busy Bees
          </Link>
          <nav className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="py-1 text-stone-700 hover:text-stone-950">
                {item.label}
              </Link>
            ))}
          </nav>
          <form action="/logout" method="post" className="flex items-center gap-3 text-sm text-stone-600">
            <span className="hidden sm:inline">{userName}</span>
            <button className="min-h-10 rounded-md px-2 text-stone-700 underline">Log out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
