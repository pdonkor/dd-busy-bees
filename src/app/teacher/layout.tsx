import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const NAV = [
  { href: "/teacher", label: "My day" },
  { href: "/teacher/log", label: "Log activity" },
  { href: "/teacher/tasks", label: "My tasks" },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("teacher");
  return (
    <AppShell nav={NAV} userName={user.fullName}>
      {children}
    </AppShell>
  );
}
