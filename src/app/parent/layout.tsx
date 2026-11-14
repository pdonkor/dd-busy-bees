import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const NAV = [
  { href: "/parent", label: "Today" },
  { href: "/parent/progress", label: "Progress" },
  { href: "/parent/fees", label: "Fees" },
  { href: "/parent/messages", label: "Messages" },
  { href: "/parent/notices", label: "Notices" },
  { href: "/parent/account", label: "My account" },
];

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("parent");
  return (
    <AppShell nav={NAV} userName={user.fullName}>
      {children}
    </AppShell>
  );
}
