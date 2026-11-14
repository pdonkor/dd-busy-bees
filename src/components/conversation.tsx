import { formatDay, formatTime } from "@/lib/dates";

export type Message = { id: string; body: string; created_at: string; sender_id: string; read_at: string | null };

/** A parent–office conversation, oldest first. "mine" decides which side a bubble sits on. */
export function Conversation({ messages, mine, otherName }: { messages: Message[]; mine: (m: Message) => boolean; otherName: string }) {
  if (!messages.length) return <p className="text-sm text-stone-500">No messages yet.</p>;
  return (
    <ol className="space-y-2">
      {messages.map((m) => (
        <li key={m.id} className={`flex ${mine(m) ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
              mine(m) ? "bg-amber-100 text-stone-900" : "border border-stone-200 bg-white text-stone-900"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className="mt-1 text-[11px] text-stone-500">
              {mine(m) ? "You" : otherName} · {formatDay(m.created_at.slice(0, 10))} {formatTime(m.created_at)}
              {mine(m) && m.read_at && " · read"}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
