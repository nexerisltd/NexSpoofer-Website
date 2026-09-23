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

// ---------------------------------------------------------------------
// Media servers (multi-provider Worker deployments)
// ---------------------------------------------------------------------

function normalizeWorkerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withProto = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProto);
    // Strip any trailing slash/path — the app always appends /media/... itself.
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

export async function addServer(name: string, workerUrl: string) {
  const auth = await assertSuperAdmin();
  const cleanName = name.trim();
  const cleanUrl = normalizeWorkerUrl(workerUrl);
  if (!cleanName || !cleanUrl) return;
  const supabase = createServiceClient();
  await supabase.from("media_servers").insert({ name: cleanName, worker_url: cleanUrl, enabled: true, created_by: auth.user.id });
  await logAction(auth.user.id, "SERVER_ADDED", "media_server", cleanName, { worker_url: cleanUrl });
  revalidatePath("/sa");
}

export async function setServerEnabled(serverId: string, enabled: boolean) {
  const auth = await assertSuperAdmin();
  const supabase = createServiceClient();
  await supabase.from("media_servers").update({ enabled }).eq("id", serverId);
  await logAction(auth.user.id, enabled ? "SERVER_ENABLED" : "SERVER_DISABLED", "media_server", serverId);
  revalidatePath("/sa");
}

export async function removeServer(serverId: string, name: string) {
  const auth = await assertSuperAdmin();
  const supabase = createServiceClient();
  // Links already pointing at this server fall back to
  // NEXT_PUBLIC_MEDIA_PROXY_URL automatically (server_id -> null via FK).
  await supabase.from("media_servers").delete().eq("id", serverId);
  await logAction(auth.user.id, "SERVER_REMOVED", "media_server", name);
  revalidatePath("/sa");
}

/** Toggle one admin's access to one server on/off — called from a checkbox
 * grid in /sa, so it takes the desired end state directly rather than
 * flipping current state (avoids a race if two clicks land close together). */
export async function setAdminServerAccess(adminId: string, serverId: string, hasAccess: boolean) {
  const auth = await assertSuperAdmin();
  const supabase = createServiceClient();
  if (hasAccess) {
    await supabase
      .from("admin_server_access")
      .upsert({ admin_id: adminId, server_id: serverId, granted_by: auth.user.id }, { onConflict: "admin_id,server_id" });
    await logAction(auth.user.id, "SERVER_ACCESS_GRANTED", "admin_server_access", `${adminId}:${serverId}`);
  } else {
    await supabase.from("admin_server_access").delete().eq("admin_id", adminId).eq("server_id", serverId);
    await logAction(auth.user.id, "SERVER_ACCESS_REVOKED", "admin_server_access", `${adminId}:${serverId}`);
  }
  revalidatePath("/sa");
}

export type ServerHealth = { ok: boolean; detail: string; ms: number };

/**
 * Pings a Worker with a bogus link id and checks whether OUR OWN JSON error
 * shape comes back ({"success":false,"error":{"code":"LINK_NOT_FOUND",...}}).
 * That distinguishes "the Worker is alive and our code is still running"
 * from "the account/Worker was suspended or deleted" (which surfaces as a
 * connection failure, a Cloudflare edge error page, or a non-JSON body) —
 * without needing any real media link or touching the database at all.
 */
export async function checkServerHealth(serverId: string): Promise<ServerHealth> {
  await assertSuperAdmin();
  const supabase = createServiceClient();
  const { data: server } = await supabase.from("media_servers").select("worker_url").eq("id", serverId).maybeSingle();
  if (!server) return { ok: false, detail: "Server not found.", ms: 0 };

  const started = Date.now();
  try {
    const res = await fetch(`${server.worker_url}/media/__healthcheck__`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const ms = Date.now() - started;
    const body = await res.json().catch(() => null);
    if (body && body.success === false && body.error?.code === "LINK_NOT_FOUND") {
      return { ok: true, detail: `Responding normally (${res.status}).`, ms };
    }
    if (body && body.error?.code === "FORBIDDEN_ORIGIN") {
      // Worker is alive but the health check itself has no Referer — still
      // proves the account/Worker exists and is executing code.
      return { ok: true, detail: "Responding normally (referer-guard active).", ms };
    }
    return { ok: false, detail: `Unexpected response (HTTP ${res.status}) — Worker may be suspended or misconfigured.`, ms };
  } catch (e) {
    const ms = Date.now() - started;
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, detail: `Unreachable: ${msg}`, ms };
  }
}
