import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "teacher" | "parent";

export type CurrentUser = {
  id: string;
  schoolId: string;
  role: Role;
  fullName: string;
  /** True when this session passed two-step verification. */
  mfaVerified: boolean;
};

export const HOME_BY_ROLE: Record<Role, string> = {
  owner: "/owner",
  admin: "/owner",
  teacher: "/teacher",
  parent: "/parent",
};

/** The logged-in user's active profile, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, school_id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null; // no profile, or deactivated

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    id: profile.id,
    schoolId: profile.school_id,
    role: profile.role,
    fullName: profile.full_name,
    mfaVerified: aal?.currentLevel === "aal2",
  };
});

/**
 * Guards a page or server action: redirects unless the user has one of the roles.
 * Owners and admins must also have passed two-step verification.
 */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect(HOME_BY_ROLE[user.role]);
  if ((user.role === "owner" || user.role === "admin") && !user.mfaVerified) redirect("/mfa");
  return user;
}
