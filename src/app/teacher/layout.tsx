import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("teacher");
  return (
    <AppShell nav={[{ href: "/teacher", label: "My day" }]} userName={user.fullName}>
      {children}
    </AppShell>
  );
}
