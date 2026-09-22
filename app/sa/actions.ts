"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createServerClient } from "@/lib/supabase/server";

async function assertSuperAdmin() {
  const auth = await requireRole(["super_admin"]);
  if (!auth.ok) throw new Error(auth.message);
  return auth;
}

export async function signOutAction() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function logAction(actorId: string, action: string, targetType: string, targetId: string, metadata?: object) {
  const supabase = createServiceClient();
  await supabase.from("audit_logs").insert({
    actor_user_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata: metadata || {},
  });
}

export async function updateUserRole(userId: string, role: "user" | "admin" | "super_admin") {
  const auth = await assertSuperAdmin();
  const supabase = createServiceClient();
  await supabase.from("profiles").update({ role }).eq("id", userId);
  await logAction(auth.user.id, "ADMIN_PERMISSION_CHANGED", "profile", userId, { role });
  revalidatePath("/sa");
}

export async function setUserStatus(userId: string, status: "active" | "suspended") {
  const auth = await assertSuperAdmin();
  const supabase = createServiceClient();
  await supabase.from("profiles").update({ status }).eq("id", userId);
  await logAction(auth.user.id, status === "suspended" ? "USER_SUSPENDED" : "USER_REACTIVATED", "profile", userId);
  revalidatePath("/sa");
}

export async function revokeLink(linkId: string) {
  const auth = await assertSuperAdmin();
  const supabase = createServiceClient();
  await supabase.from("media_links").update({ status: "revoked" }).eq("id", linkId);
  await logAction(auth.user.id, "LINK_REVOKED", "media_link", linkId);
  revalidatePath("/sa");
}

/**
 * Approved-domains input accepts either a bare hostname ("b-cdn.net") or a
 * full URL ("https://www.example.com/some/path") — normalizes either form
 * down to just the lowercased hostname, since that's what
 * lib/security.ts's isHostnameAllowed() actually compares against
 * (target.hostname from the media URL). Without this, pasting a full URL
 * (with protocol/path) got stored verbatim and could never match any real
 * hostname, silently breaking the allowlist for that entry.
 */
function normalizeHostname(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase();
  } catch {
    // Fall back to the raw trimmed/lowercased value if it's not a parseable
    // URL or hostname at all (better to store something inspectable in /sa
    // than to silently drop it).
    return trimmed.toLowerCase();
  }
}

export async function addAllowedDomain(hostname: string) {
  const auth = await assertSuperAdmin();
  const clean = normalizeHostname(hostname);
  if (!clean) return;
  const supabase = createServiceClient();
  await supabase.from("allowed_media_domains").insert({ hostname: clean, enabled: true, created_by: auth.user.id });
  await logAction(auth.user.id, "DOMAIN_ADDED", "allowed_media_domain", clean);
  revalidatePath("/sa");
}

export async function removeAllowedDomain(id: string, hostname: string) {
  const auth = await assertSuperAdmin();
  const supabase = createServiceClient();
  await supabase.from("allowed_media_domains").delete().eq("id", id);
  await logAction(auth.user.id, "DOMAIN_REMOVED", "allowed_media_domain", hostname);
  revalidatePath("/sa");
}
