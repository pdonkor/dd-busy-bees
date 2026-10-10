import { redirect } from "next/navigation";
import { getCurrentUser, HOME_BY_ROLE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(HOME_BY_ROLE[user.role]);

  // Logged in but no active profile (e.g. deactivated): end the session.
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (authUser) {
    await supabase.auth.signOut();
    redirect("/login?inactive=1");
  }
  redirect("/login");
}
