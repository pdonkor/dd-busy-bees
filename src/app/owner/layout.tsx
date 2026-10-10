import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const NAV = [
  { href: "/owner", label: "Today" },
  { href: "/owner/children", label: "Children" },
  { href: "/owner/staff", label: "Staff" },
  { href: "/owner/classes", label: "Classes" },
  { href: "/owner/curriculum", label: "Curriculum" },
];

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("owner", "admin");
  return (
    <AppShell nav={NAV} userName={user.fullName}>
      {children}
    </AppShell>
  );
}
