import { redirect } from "next/navigation";
import { getCurrentUser, HOME_BY_ROLE } from "@/lib/auth";
import { MfaForm } from "./mfa-form";

export default async function MfaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?mode=email");
  if (user.role !== "owner" && user.role !== "admin") redirect(HOME_BY_ROLE[user.role]);
  if (user.mfaVerified) redirect("/owner");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-center text-2xl font-semibold">Two-step verification</h1>
      <p className="mb-6 mt-1 text-center text-sm text-stone-600">
        School office accounts need a code from an authenticator app every time they log in.
      </p>
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <MfaForm />
      </div>
    </main>
  );
}
