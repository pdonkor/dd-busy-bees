import { revalidatePath } from "next/cache";
import { ActionForm } from "@/components/action-form";
import { Conversation } from "@/components/conversation";
import { SubmitButton } from "@/components/form-status";
import { Card, PageHeader, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function sendToSchool(_prev: ActionState, formData: FormData): Promise<ActionState> {
  "use server";
  const user = await requireRole("parent");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write your message first." };
  if (body.length > 4000) return { error: "That message is too long." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ school_id: user.schoolId, parent_id: user.id, sender_id: user.id, body });
  if (error) return { error: "That didn't send. Please try again." };
  revalidatePath("/parent/messages");
  return { success: "Sent. The school office will reply here." };
}

export default async function ParentMessages() {
  const user = await requireRole("parent");
  const supabase = await createClient();
  const { data: messages } = await supabase
    .from("messages")
    .select("id, body, created_at, sender_id, read_at")
    .eq("parent_id", user.id)
    .order("created_at")
    .limit(200);
  if (messages?.some((m) => m.sender_id !== user.id && !m.read_at)) {
    await supabase.rpc("mark_messages_read", { conversation: user.id });
  }
  return (
    <>
      <PageHeader title="Message the school" subtitle="Your messages go to the school office, and the school keeps a record." />
      <Card>
        <Conversation messages={messages ?? []} mine={(m) => m.sender_id === user.id} otherName="School office" />
        <ActionForm action={sendToSchool} className="mt-4 space-y-2">
          <Textarea name="body" rows={3} maxLength={4000} placeholder="Write a message…" aria-label="Message" required />
          <SubmitButton pendingText="Sending…">Send</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
