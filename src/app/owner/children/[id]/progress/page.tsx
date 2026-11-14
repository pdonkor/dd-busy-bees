import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressView } from "@/components/progress-view";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function OwnerChildProgress({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("owner", "admin");
  const { id } = await params;
  const supabase = await createClient();
  const { data: child } = await supabase.from("children").select("id, first_name, last_name").eq("id", id).maybeSingle();
  if (!child) notFound();
  return (
    <>
      <PageHeader
        title={`${child.first_name} ${child.last_name}: progress`}
        action={
          <Link href={`/owner/children/${id}`} className="text-sm text-amber-800 underline">
            Back to profile
          </Link>
        }
      />
      <ProgressView supabase={supabase} childId={id} />
    </>
  );
}
