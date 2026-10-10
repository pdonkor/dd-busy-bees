import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createChild } from "../../actions";
import { ChildFields } from "../child-fields";

export default async function NewChildPage() {
  // The layout checks too, but layouts are skipped on some client navigations.
  await requireRole("owner", "admin");
  const supabase = await createClient();
  const { data: classes } = await supabase.from("classes").select("id, name").eq("archived", false).order("name");
  return (
    <>
      <PageHeader title="Enrol a child" subtitle="You can invite the parents on the next screen." />
      <Card>
        <ActionForm action={createChild}>
          <ChildFields classes={classes ?? []} />
          <SubmitButton>Enrol child</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
