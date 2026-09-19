import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type Role = "user" | "admin" | "super_admin";

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: Role;
  status: "active" | "suspended";
};

/**
 * Returns the signed-in user + their DB-backed profile/role, or nulls if
 * signed out. This is the ONLY place in the app that checks an email
 * directly against a config value — and only to perform a one-time,
 * idempotent promotion to super_admin for whichever address is set in
 * BOOTSTRAP_SUPER_ADMIN_EMAIL. Every actual authorization decision
 * elsewhere in the app reads `profile.role` from the database, never an
 * email string — this exists solely to solve the "who is the very first
 * super admin" bootstrap problem without a manual SQL step.
 */
export async function getSessionProfile(): Promise<{ user: null; profile: null } | { user: NonNullable<Awaited<ReturnType<typeof getUserOnly>>>; profile: Profile }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const service = createServiceClient();

  const bootstrapEmail = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.toLowerCase().trim();
  if (bootstrapEmail && user.email?.toLowerCase() === bootstrapEmail) {
    await service
      .from("profiles")
      .update({ role: "super_admin" })
      .eq("id", user.id)
      .neq("role", "super_admin");
  }

  const { data: profile } = await service
    .from("profiles")
    .select("id, email, name, avatar_url, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return { user: null, profile: null };
  return { user, profile: profile as Profile };
}

async function getUserOnly() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export type RoleCheckResult =
  | { ok: true; user: { id: string; email: string | null }; profile: Profile }
  | { ok: false; status: 401 | 403; message: string };

/** Server-side gate for route handlers and pages. Never trust a client-sent
 * role — this always re-derives it from the DB via getSessionProfile(). */
export async function requireRole(roles: Role[]): Promise<RoleCheckResult> {
  const { user, profile } = await getSessionProfile();
  if (!user || !profile) {
    return { ok: false, status: 401, message: "You must be signed in." };
  }
  if (profile.status !== "active") {
    return { ok: false, status: 403, message: "Your account is suspended." };
  }
  if (!roles.includes(profile.role)) {
    return { ok: false, status: 403, message: "You are not authorized to access this." };
  }
  return { ok: true, user: { id: user.id, email: user.email ?? null }, profile };
}
