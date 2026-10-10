import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("parent");
  return (
    <AppShell nav={[{ href: "/parent", label: "My children" }]} userName={user.fullName}>
      {children}
    </AppShell>
  );
}
