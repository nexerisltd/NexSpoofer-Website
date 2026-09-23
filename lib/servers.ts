import { createServiceClient } from "@/lib/supabase/service";
import type { Role } from "@/lib/auth";

export type MediaServer = {
  id: string;
  name: string;
  worker_url: string;
  enabled: boolean;
};

/**
 * The servers a given user is allowed to generate links against.
 * - super_admin: every enabled server, no explicit grant needed.
 * - admin: only servers explicitly granted via admin_server_access
 *   (and still filtered to enabled === true).
 * - user: none (LinkGen is admin+ only anyway, requireRole() blocks first).
 */
export async function getServersForUser(userId: string, role: Role): Promise<MediaServer[]> {
  const supabase = createServiceClient();

  if (role === "super_admin") {
    const { data } = await supabase
      .from("media_servers")
      .select("id, name, worker_url, enabled")
      .eq("enabled", true)
      .order("created_at", { ascending: true });
    return (data as MediaServer[]) || [];
  }

  const { data } = await supabase
    .from("admin_server_access")
    .select("media_servers(id, name, worker_url, enabled)")
    .eq("admin_id", userId);

  type Row = { media_servers: MediaServer | MediaServer[] | null };
  return ((data as Row[]) || [])
    .map((row) => (Array.isArray(row.media_servers) ? row.media_servers[0] : row.media_servers))
    .filter((s): s is MediaServer => !!s && s.enabled);
}

/** Server-side authorization check — never trust a serverId the client sent
 * without re-verifying the requesting user actually has access to it. */
export async function userHasServerAccess(userId: string, role: Role, serverId: string): Promise<boolean> {
  if (role === "super_admin") {
    const supabase = createServiceClient();
    const { data } = await supabase.from("media_servers").select("id").eq("id", serverId).eq("enabled", true).maybeSingle();
    return !!data;
  }
  const servers = await getServersForUser(userId, role);
  return servers.some((s) => s.id === serverId);
}

export async function getServerById(id: string): Promise<MediaServer | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("media_servers").select("id, name, worker_url, enabled").eq("id", id).maybeSingle();
  return (data as MediaServer) || null;
}

export async function getAllServers(): Promise<MediaServer[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("media_servers").select("id, name, worker_url, enabled").order("created_at", { ascending: true });
  return (data as MediaServer[]) || [];
}
