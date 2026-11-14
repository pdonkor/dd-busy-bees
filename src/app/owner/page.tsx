import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { today } from "@/lib/dates";
import { formatGhs } from "@/lib/money";
import { classRatios } from "@/lib/oversight";
import { createClient } from "@/lib/supabase/server";
import { loadTaskStates } from "@/lib/task-status";

export default async function OwnerToday() {
  const user = await requireRole("owner", "admin");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const date = today();

  const [children, staff, invites, unassigned, attendance, tasks, shifts, balances, overdueInvoices] = await Promise.all([
    supabase.from("children").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher").eq("active", true),
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
    supabase.from("attendance").select("id, collected_by_unlisted, collected_by, children(first_name)").eq("date", date),
    supabase.from("task_templates").select("id, frequency, weekday, day_of_month, month").eq("active", true),
    supabase.from("staff_shifts").select("staff_id, clock_out_at").eq("date", date),
    supabase.from("child_balances").select("child_id, balance_pesewas").gt("balance_pesewas", 0),
    supabase.from("invoices").select("child_id").is("voided_at", null).lt("due_on", date),
  ]);
  const [ratios, incidents, enquiries, messages, pickupRequests] = await Promise.all([
    classRatios(supabase),
    supabase.from("incidents").select("id", { count: "exact", head: true }).is("owner_signoff_at", null),
    supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("stage", "enquiry"),
    supabase.from("messages").select("parent_id, sender_id").is("read_at", null),
    supabase.from("authorised_pickups").select("child_id, children(first_name)").eq("approved", false),
  ]);
  const overRatio = ratios.filter((r) => r.over);
  const unreadFromParents = (messages.data ?? []).filter((m) => m.sender_id === m.parent_id).length;
  const staffIn = (shifts.data ?? []).filter((s) => !s.clock_out_at).length;
  const overdueChildren = new Set((overdueInvoices.data ?? []).map((i) => i.child_id));
  const owing = (balances.data ?? []).filter((b) => overdueChildren.has(b.child_id));
  const owed = owing.reduce((s, b) => s + Number(b.balance_pesewas), 0);
  const present = attendance.data?.length ?? 0;
  const unlisted = (attendance.data ?? []).filter((a) => a.collected_by_unlisted);
  const overdue = (await loadTaskStates(supabase, tasks.data ?? [])).filter((s) => s.state === "overdue").length;

  const tiles = [
    { label: "In today", value: `${present} / ${children.count ?? 0}`, href: "/owner/attendance" },
    { label: "Staff on site", value: `${staffIn} / ${staff.count ?? 0}`, href: "/owner/staff-time" },
    { label: "Overdue fees", value: formatGhs(owed), href: "/owner/fees" },
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
        <ul className="space-y-2 text-sm">
          {overRatio.map((r) => (
            <li key={r.id}>
              <Link href="/owner/oversight" className="font-semibold text-red-800 underline">
                {r.name} is over ratio: {r.childrenIn} children with {r.staffIn} staff (limit 1:{r.ratio})
              </Link>
            </li>
          ))}
          {!!incidents.count && (
            <li>
              <Link href="/owner/incidents" className="text-red-800 underline">
                {incidents.count} incident {incidents.count === 1 ? "report needs" : "reports need"} your sign-off
              </Link>
            </li>
          )}
          {unreadFromParents > 0 && (
            <li>
              <Link href="/owner/messages" className="text-amber-800 underline">
                {unreadFromParents} unread {unreadFromParents === 1 ? "message" : "messages"} from parents
              </Link>
            </li>
          )}
          {!!enquiries.count && (
            <li>
              <Link href="/owner/enquiries" className="text-amber-800 underline">
                {enquiries.count} new {enquiries.count === 1 ? "enquiry" : "enquiries"} about a place
              </Link>
            </li>
          )}
          {(pickupRequests.data ?? []).map((p, i) => (
            <li key={i}>
              <Link href={`/owner/children/${p.child_id}`} className="text-amber-800 underline">
                A parent asked to add someone to {(p.children as unknown as { first_name: string } | null)?.first_name}&apos;s pick-up list
              </Link>
            </li>
          ))}
          {unlisted.map((a) => (
            <li key={a.id}>
              <Link href="/owner/attendance" className="text-red-800 underline">
                {(a.children as unknown as { first_name: string } | null)?.first_name} was collected by {a.collected_by},
                who is not on the pick-up list
              </Link>
            </li>
          ))}
          {overdue > 0 && (
            <li>
              <Link href="/owner/tasks" className="text-amber-800 underline">
                {overdue} upkeep {overdue === 1 ? "task was" : "tasks were"} missed
              </Link>
            </li>
          )}
          {owing.length > 0 && (
            <li>
              <Link href="/owner/fees" className="text-amber-800 underline">
                {owing.length} {owing.length === 1 ? "family has" : "families have"} overdue fees ({formatGhs(owed)})
              </Link>
            </li>
          )}
          {!!unassigned.count && (
            <li>
              <Link href="/owner/children" className="text-amber-800 underline">
                {unassigned.count} {unassigned.count === 1 ? "child has" : "children have"} no class yet
              </Link>
            </li>
          )}
        </ul>
        {!unlisted.length &&
          !overdue &&
          !unassigned.count &&
          !owing.length &&
          !overRatio.length &&
          !incidents.count &&
          !unreadFromParents &&
          !enquiries.count &&
          !pickupRequests.data?.length && <p className="text-sm text-stone-600">Nothing right now.</p>}
      </Card>
    </>
  );
}
