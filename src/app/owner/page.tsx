import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function OwnerToday() {
  const user = await requireRole("owner", "admin");
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [children, staff, classes, invites, unassigned] = await Promise.all([
    supabase.from("children").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher").eq("active", true),
    supabase.from("classes").select("id", { count: "exact", head: true }).eq("archived", false),
    supabase
      .from("invites")
      .select("id", { count: "exact", head: true })
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", now),
    supabase
      .from("children")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .is("class_id", null),
  ]);

  const tiles = [
    { label: "Children enrolled", value: children.count ?? 0, href: "/owner/children" },
    { label: "Teachers", value: staff.count ?? 0, href: "/owner/staff" },
    { label: "Classes", value: classes.count ?? 0, href: "/owner/classes" },
    { label: "Invites waiting", value: invites.count ?? 0, href: "/owner/staff" },
  ];

  return (
    <>
      <PageHeader
        title={`Good day, ${user.fullName.split(" ")[0]}`}
        subtitle={new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "Africa/Accra",
        })}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-3xl font-semibold text-stone-900">{t.value}</p>
            <p className="text-sm text-stone-600">{t.label}</p>
          </Link>
        ))}
      </div>
      <Card title="Needs attention" className="mt-6">
        {unassigned.count ? (
          <Link href="/owner/children" className="text-sm text-amber-800 underline">
            {unassigned.count} {unassigned.count === 1 ? "child has" : "children have"} no class yet
          </Link>
        ) : (
          <p className="text-sm text-stone-600">Nothing right now.</p>
        )}
        <p className="mt-3 text-xs text-stone-500">
          Attendance, staff on site, overdue tasks and fees will appear here as later phases are built.
        </p>
      </Card>
    </>
  );
}
