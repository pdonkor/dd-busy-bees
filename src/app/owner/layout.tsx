import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const NAV = [
  { href: "/owner", label: "Today" },
  { href: "/owner/attendance", label: "Attendance" },
  { href: "/owner/children", label: "Children" },
  { href: "/owner/staff", label: "Staff" },
  { href: "/owner/classes", label: "Classes" },
  { href: "/owner/curriculum", label: "Curriculum" },
  { href: "/owner/tasks", label: "Upkeep tasks" },
];

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("owner", "admin");
  return (
    <AppShell nav={NAV} userName={user.fullName}>
      {children}
    </AppShell>
  );
}
