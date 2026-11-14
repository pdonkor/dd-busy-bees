import { Notices } from "@/components/notices";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ParentNotices() {
  await requireRole("parent");
  return (
    <>
      <PageHeader title="Notices and calendar" subtitle="News from the school and dates for your diary." />
      <Notices supabase={await createClient()} />
    </>
  );
}
