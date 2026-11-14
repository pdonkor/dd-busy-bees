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
      <header className="border-b border-stone-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3">
          <Link href="/" className="font-semibold text-amber-700">
            DD Busy Bees
          </Link>
          <nav className="hidden flex-1 flex-wrap gap-x-4 gap-y-1 text-sm md:flex">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="py-1 text-stone-700 hover:text-stone-950">
                {item.label}
              </Link>
            ))}
          </nav>
          {/* On phones the menu folds away so the page starts near the top of the screen. */}
          <details className="order-last w-full md:hidden">
            <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium text-stone-700">Menu</summary>
            <nav className="grid grid-cols-2 gap-1 pb-2 text-sm">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-md px-2 py-2 text-stone-700 hover:bg-stone-100">
                  {item.label}
                </Link>
              ))}
            </nav>
          </details>
          <form action="/logout" method="post" className="flex items-center gap-3 text-sm text-stone-600">
            <span className="hidden sm:inline">{userName}</span>
            <button className="min-h-10 rounded-md px-2 text-stone-700 underline">Log out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
