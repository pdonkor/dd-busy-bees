import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ParentHome() {
  const user = await requireRole("parent");
  const supabase = await createClient();
  // Row-level security limits this to the parent's own children.
  const { data: children } = await supabase
    .from("children")
    .select("id, first_name, last_name, classes(name), authorised_pickups(id, full_name, relationship)")
    .eq("status", "active")
    .order("first_name");

  return (
    <>
      <PageHeader
        title={`Hello, ${user.fullName.split(" ")[0]}`}
        subtitle="Your child's day, photos and fees will appear here as the app grows."
      />
      {!children?.length && <Empty>No children are linked to your account yet. Please contact the school.</Empty>}
      <div className="space-y-4">
        {children?.map((c) => {
          const cls = c.classes as unknown as { name: string } | null;
          return (
            <Card key={c.id} title={`${c.first_name} ${c.last_name}`}>
              <p className="text-sm text-stone-600">Class: {cls?.name ?? "not assigned yet"}</p>
              <p className="mt-3 text-sm font-medium">Also allowed to pick up</p>
              {c.authorised_pickups.length ? (
                <ul className="text-sm text-stone-700">
                  {c.authorised_pickups.map((p: { id: string; full_name: string; relationship: string | null }) => (
                    <li key={p.id}>
                      {p.full_name}
                      {p.relationship && ` (${p.relationship})`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone-500">Only you and other linked parents.</p>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
