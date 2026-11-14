import { revalidatePath } from "next/cache";
import Link from "next/link";
import { z } from "zod";
import { ActionForm } from "@/components/action-form";
import { Conversation } from "@/components/conversation";
import { SubmitButton } from "@/components/form-status";
import { Card, Empty, PageHeader, Select, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { requireRole } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { notifyParentOfReply } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";

async function reply(parentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  "use server";
  const user = await requireRole("owner", "admin");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write your reply first." };
  if (body.length > 4000) return { error: "That message is too long." };
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const { error } = await supabase
    .from("messages")
    .insert({ id, school_id: user.schoolId, parent_id: z.string().uuid().parse(parentId), sender_id: user.id, body });
  if (error) return { error: "That didn't send. Please try again." };
  await notifyParentOfReply(user.schoolId, parentId, id).catch(() => undefined);
  revalidatePath("/owner/messages");
  return { success: "Sent. The parent gets an SMS to say there's a message." };
}

export default async function OwnerMessages({ searchParams }: { searchParams: Promise<{ parent?: string }> }) {
  const user = await requireRole("owner", "admin");
  const { parent } = await searchParams;
  const supabase = await createClient();
  const [{ data: recent }, { data: parents }] = await Promise.all([
    supabase.from("messages").select("parent_id, sender_id, created_at, read_at, body").order("created_at", { ascending: false }).limit(500),
    supabase.from("profiles").select("id, full_name").eq("role", "parent").eq("active", true).order("full_name"),
  ]);
  const name = new Map((parents ?? []).map((p) => [p.id, p.full_name]));
  // One row per conversation, newest first, with an unread count of the parent's messages.
  const threads = new Map<string, { last: string; preview: string; unread: number }>();
  for (const m of recent ?? []) {
    const t = threads.get(m.parent_id) ?? { last: m.created_at, preview: m.body.slice(0, 80), unread: 0 };
    if (m.sender_id === m.parent_id && !m.read_at) t.unread++;
    threads.set(m.parent_id, t);
  }

  let conversation = null;
  if (parent && z.string().uuid().safeParse(parent).success) {
    const { data } = await supabase
      .from("messages")
      .select("id, body, created_at, sender_id, read_at")
      .eq("parent_id", parent)
      .order("created_at")
      .limit(200);
    conversation = data ?? [];
    if (threads.get(parent)?.unread) await supabase.rpc("mark_messages_read", { conversation: parent });
  }

  return (
    <>
      <PageHeader title="Messages" subtitle="Conversations with parents. Teachers can't see or send messages." />
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card title="Conversations">
          <form className="mb-3 flex gap-2">
            <Select name="parent" defaultValue={parent ?? ""} aria-label="Start a conversation with">
              <option value="">Write to a parent…</option>
              {parents?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
            <button className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold">Open</button>
          </form>
          {!threads.size && <Empty>No messages yet.</Empty>}
          <ul className="divide-y divide-stone-100 text-sm">
            {[...threads].map(([pid, t]) => (
              <li key={pid}>
                <Link href={`/owner/messages?parent=${pid}`} className={`block py-2 ${pid === parent ? "font-semibold" : ""}`}>
                  <span className="flex justify-between">
                    <span>{name.get(pid) ?? "Former parent"}</span>
                    {t.unread > 0 && <span className="rounded-full bg-amber-500 px-2 text-xs text-stone-950">{t.unread}</span>}
                  </span>
                  <span className="block truncate text-xs text-stone-500">
                    {formatDay(t.last.slice(0, 10))} · {t.preview}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        {conversation && parent ? (
          <Card title={name.get(parent) ?? "Parent"}>
            <Conversation messages={conversation} mine={(m) => m.sender_id !== parent} otherName={name.get(parent) ?? "Parent"} />
            <ActionForm action={reply.bind(null, parent)} className="mt-4 space-y-2">
              <Textarea name="body" rows={3} maxLength={4000} placeholder={`Reply as ${user.fullName}…`} aria-label="Reply" required />
              <SubmitButton pendingText="Sending…">Send</SubmitButton>
            </ActionForm>
          </Card>
        ) : (
          <Empty>Choose a conversation.</Empty>
        )}
      </div>
    </>
  );
}
