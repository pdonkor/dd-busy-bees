import { Alert } from "@/components/ui";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-center text-2xl font-semibold">DD Busy Bees</h1>
      <p className="mb-6 mt-1 text-center text-sm text-stone-600">Log in to continue</p>
      <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        {params.inactive && <Alert>This account has been switched off. Please contact the school.</Alert>}
        {params.welcome && <Alert kind="success">Your account is ready. Log in to continue.</Alert>}
        <LoginForm defaultMode={params.mode === "email" ? "email" : "phone"} />
      </div>
      <p className="mt-6 text-center text-xs text-stone-500">
        Accounts are created by the school. If you don&apos;t have one, please ask the school office.
      </p>
    </main>
  );
}
