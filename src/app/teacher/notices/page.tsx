import { Notices } from "@/components/notices";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TeacherNotices() {
  await requireRole("teacher");
  return (
    <>
      <PageHeader title="Notices and calendar" subtitle="Announcements from the office and the school calendar." />
      <Notices supabase={await createClient()} />
    </>
  );
}
