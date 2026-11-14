import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

const NAV = [
  { href: "/teacher", label: "My day" },
  { href: "/teacher/log", label: "Log activity" },
  { href: "/teacher/tasks", label: "My tasks" },
  { href: "/teacher/incident", label: "Incident" },
  { href: "/teacher/lesson-plans", label: "Lesson plans" },
  { href: "/teacher/reports", label: "Reports" },
  { href: "/teacher/notices", label: "Notices" },
  { href: "/teacher/clock", label: "Clock-ins" },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("teacher");
  return (
    <AppShell nav={NAV} userName={user.fullName}>
      {children}
    </AppShell>
  );
}
