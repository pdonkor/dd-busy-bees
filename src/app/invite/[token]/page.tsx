import { Alert } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/tokens";
import { AcceptForm } from "./accept-form";

const ROLE_LABEL = { admin: "school office (admin)", teacher: "teacher", parent: "parent" } as const;

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("invites")
    .select("full_name, role, email, phone, expires_at, accepted_at, revoked_at, schools(name)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  const valid =
    invite && !invite.accepted_at && !invite.revoked_at && new Date(invite.expires_at).getTime() > Date.now();
  const school = (invite?.schools as unknown as { name: string } | null)?.name ?? "DD Busy Bees";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-center text-2xl font-semibold">{school}</h1>
      <div className="mt-6 space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        {valid ? (
          <>
            <p className="text-sm text-stone-700">
              Hello {invite.full_name}. You&apos;ve been invited to join as a{" "}
              {ROLE_LABEL[invite.role as keyof typeof ROLE_LABEL]}.
              {invite.phone && <> You&apos;ll log in with a code sent to {invite.phone}.</>}
            </p>
            <AcceptForm token={token} needsPassword={!!invite.email} />
          </>
        ) : (
          <Alert>This invite link has expired or has already been used. Ask the school for a new one.</Alert>
        )}
      </div>
    </main>
  );
}
