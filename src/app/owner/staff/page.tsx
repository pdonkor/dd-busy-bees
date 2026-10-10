import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { assignClass, inviteStaff, revokeInvite, setUserActive, unassignClass } from "../actions";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Office admin", teacher: "Teacher" };

export default async function StaffPage() {
  const user = await requireRole("owner", "admin");
  const supabase = await createClient();
  const [{ data: staff }, { data: classes }, { data: invites }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, phone, email, active, staff_assignments(class_id)")
      .in("role", ["owner", "admin", "teacher"])
      .order("active", { ascending: false })
      .order("full_name"),
    supabase.from("classes").select("id, name").eq("archived", false).order("name"),
    supabase
      .from("invites")
      .select("id, full_name, role, phone, email, expires_at")
      .in("role", user.role === "owner" ? ["admin", "teacher"] : ["teacher"])
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);
  const className = new Map((classes ?? []).map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="Staff" subtitle="Invite teachers, assign them to classes, and switch off accounts when someone leaves." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Invite a teacher">
          <ActionForm action={inviteStaff}>
            <input type="hidden" name="role" value="teacher" />
            <Field label="Full name">
              <Input name="full_name" required maxLength={120} />
            </Field>
            <Field label="Mobile number" hint="They log in with a code sent to this number.">
              <Input name="phone" type="tel" inputMode="tel" required placeholder="024 123 4567" />
            </Field>
            <Field label="Class (optional)">
              <Select name="class_id" defaultValue="">
                <option value="">Choose later</option>
                {classes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton pendingText="Sending invite…">Send invite</SubmitButton>
          </ActionForm>
        </Card>
        {user.role === "owner" && (
          <Card title="Invite an office admin">
            <ActionForm action={inviteStaff}>
              <input type="hidden" name="role" value="admin" />
              <p className="text-sm text-stone-600">
                Admins can do everything except change fees and roles. They log in with email, a password and an
                authenticator app.
              </p>
              <Field label="Full name">
                <Input name="full_name" required maxLength={120} />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" required />
              </Field>
              <SubmitButton pendingText="Creating invite…">Create invite</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>

      {!!invites?.length && (
        <Card title="Invites waiting to be accepted" className="mt-6">
          <ul className="divide-y divide-stone-100">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {i.full_name} · {ROLE_LABEL[i.role]} · {i.phone ?? i.email} · expires{" "}
                  {new Date(i.expires_at).toLocaleDateString("en-GB")}
                </span>
                <form action={revokeInvite.bind(null, i.id)}>
                  <SubmitButton variant="danger" pendingText="Cancelling…">
                    Cancel invite
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Team</h2>
      <div className="space-y-3">
        {!staff?.length && <Empty>No staff yet.</Empty>}
        {staff?.map((s) => {
          const assigned: string[] = s.staff_assignments.map((a: { class_id: string }) => a.class_id);
          const canToggle = s.id !== user.id && (user.role === "owner" || s.role === "teacher");
          return (
            <Card key={s.id} className={s.active ? "" : "opacity-60"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {s.full_name}
                    {!s.active && <span className="ml-2 text-sm font-normal text-red-700">Switched off</span>}
                  </p>
                  <p className="text-sm text-stone-600">
                    {ROLE_LABEL[s.role]} · {s.phone ?? s.email}
                  </p>
                </div>
                {canToggle && (
                  <form action={setUserActive.bind(null, s.id, !s.active)}>
                    <SubmitButton variant={s.active ? "danger" : "secondary"} pendingText="Saving…">
                      {s.active ? "Switch off account" : "Switch back on"}
                    </SubmitButton>
                  </form>
                )}
              </div>
              {s.role === "teacher" && s.active && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  {assigned.map((classId) => (
                    <form key={classId} action={unassignClass.bind(null, s.id, classId)}>
                      <button className="min-h-10 rounded-full bg-amber-100 px-3 text-amber-900" title="Remove from class">
                        {className.get(classId) ?? "Archived class"} ✕
                      </button>
                    </form>
                  ))}
                  <form action={assignClass.bind(null, s.id)} className="flex items-center gap-2">
                    <Select name="class_id" defaultValue="" className="w-auto" aria-label="Add to class">
                      <option value="" disabled>
                        Add to class…
                      </option>
                      {classes
                        ?.filter((c) => !assigned.includes(c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </Select>
                    <SubmitButton variant="secondary">Add</SubmitButton>
                  </form>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
