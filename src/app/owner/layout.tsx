import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const NAV = [
  { href: "/owner", label: "Today" },
  { href: "/owner/attendance", label: "Attendance" },
  { href: "/owner/children", label: "Children" },
  { href: "/owner/fees", label: "Fees" },
  { href: "/owner/staff", label: "Staff" },
  { href: "/owner/staff-time", label: "Staff on site" },
  { href: "/owner/classes", label: "Classes" },
  { href: "/owner/curriculum", label: "Curriculum" },
  { href: "/owner/tasks", label: "Upkeep tasks" },
  { href: "/owner/settings", label: "Settings" },
];

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("owner", "admin");
  return (
    <AppShell nav={NAV} userName={user.fullName}>
      {children}
    </AppShell>
  );
}
