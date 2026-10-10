import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ChildrenPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  // The layout checks too, but layouts are skipped on some client navigations.
  await requireRole("owner", "admin");
  const { show } = await searchParams;
  const status = show === "left" ? "left" : "active";
  const supabase = await createClient();
  const { data: children } = await supabase
    .from("children")
    .select("id, first_name, last_name, date_of_birth, allergies, classes(name), guardians(parent_id)")
    .eq("status", status)
    .order("first_name");

  return (
    <>
      <PageHeader
        title="Children"
        subtitle={status === "active" ? `${children?.length ?? 0} enrolled` : "Children who have left"}
        action={
          <Link href="/owner/children/new" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold">
            Enrol a child
          </Link>
        }
      />
      <p className="mb-4 text-sm">
        <Link href={status === "active" ? "/owner/children?show=left" : "/owner/children"} className="underline">
          {status === "active" ? "Show children who have left" : "Show enrolled children"}
        </Link>
      </p>
      {!children?.length ? (
        <Empty>No children here yet.</Empty>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
          {children.map((c) => {
            const cls = c.classes as unknown as { name: string } | null;
            return (
              <li key={c.id}>
                <Link href={`/owner/children/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="font-medium">
                    {c.first_name} {c.last_name}
                  </span>
                  <span className="flex flex-wrap gap-2 text-xs">
                    {c.allergies && <span className="rounded-full bg-red-100 px-2 py-1 text-red-800">Allergies</span>}
                    {!c.guardians.length && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">No parent linked</span>
                    )}
                    <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">{cls?.name ?? "No class"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
