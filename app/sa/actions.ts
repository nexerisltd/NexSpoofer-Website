"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

async function assertSuperAdmin() {
  const auth = await requireRole(["super_admin"]);
  if (!auth.ok) throw new Error(auth.message);
  return auth;
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

export async function addAllowedDomain(hostname: string) {
  const auth = await assertSuperAdmin();
  const clean = hostname.trim().toLowerCase();
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
