import { notFound } from "next/navigation";
import { Link2, Shield, FileText, Trash2, Plus } from "lucide-react";
import { requireRole, getSessionProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import DashSidebar from "@/components/sa/DashSidebar";
import UsersPanel from "@/components/sa/UsersPanel";
import ServersPanel from "@/components/sa/ServersPanel";
import ServerAccessPanel from "@/components/sa/ServerAccessPanel";
import CopyButton from "@/components/sa/CopyButton";
import LiveStatusWidget from "@/components/ui/LiveStatusWidget";
import { revokeLink, addAllowedDomain, removeAllowedDomain } from "./actions";
import type { MediaServer } from "@/lib/servers";

export const metadata = { robots: { index: false, follow: false } };

const ACTION_PILL: Record<string, string> = {
  LINK_CREATED: "pill-blue",
  LINK_REVOKED: "pill-red",
  USER_SUSPENDED: "pill-red",
  USER_REACTIVATED: "pill-green",
  ADMIN_PERMISSION_CHANGED: "pill-violet",
  DOMAIN_ADDED: "pill-green",
  DOMAIN_REMOVED: "pill-red",
  SERVER_ADDED: "pill-green",
  SERVER_REMOVED: "pill-red",
  SERVER_ENABLED: "pill-green",
  SERVER_DISABLED: "pill-amber",
  SERVER_ACCESS_GRANTED: "pill-blue",
  SERVER_ACCESS_REVOKED: "pill-red",
};

export default async function SuperAdminPage() {
  const auth = await requireRole(["super_admin"]);
  // Deliberately 404, not 403/redirect — the existence of this route is
  // not meant to be discoverable by anyone who isn't already super_admin.
  if (!auth.ok) notFound();

  const { user } = await getSessionProfile();

  const supabase = createServiceClient();
  const [{ data: profiles }, { data: links }, { data: domains }, { data: logs }, { data: servers }, { data: accessRows }] =
    await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("media_links").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("allowed_media_domains").select("*").order("created_at", { ascending: false }),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("media_servers").select("id, name, worker_url, enabled").order("created_at", { ascending: true }),
      supabase.from("admin_server_access").select("admin_id, server_id"),
    ]);

  const serverList = (servers as MediaServer[]) || [];
  const serverNameById = new Map(serverList.map((s) => [s.id, s.name]));
  const accessSet = new Set((accessRows || []).map((r: { admin_id: string; server_id: string }) => `${r.admin_id}:${r.server_id}`));
  const adminRows = (profiles || [])
    .filter((p) => p.role === "admin" || p.role === "super_admin")
    .map((p) => ({ id: p.id, email: p.email, role: p.role as "admin" | "super_admin" }));

  async function revoke(formData: FormData) {
    "use server";
    await revokeLink(String(formData.get("linkId")));
  }
  async function addDomain(formData: FormData) {
    "use server";
    await addAllowedDomain(String(formData.get("hostname")));
  }
  async function removeDomain(formData: FormData) {
    "use server";
    await removeAllowedDomain(String(formData.get("id")), String(formData.get("hostname")));
  }

  return (
    <div className="dash-shell">
      <DashSidebar email={user?.email ?? null} />

      <main className="dash-main" id="top">
        <div className="dash-header">
          <div>
            <h1>
              <span className="brand-mark" style={{ marginBottom: 0 }}>
                <span className="nex">Nex</span>
                <span className="rest">Spoofer</span>
              </span>
            </h1>
            <p className="subtitle">
              <strong style={{ color: "var(--foreground)" }}>Super Admin Panel</strong> — Manage users, servers, media links
              and system logs.
            </p>
          </div>
          <LiveStatusWidget />
        </div>

        <UsersPanel profiles={profiles || []} />

        <ServersPanel servers={serverList} />

        <ServerAccessPanel admins={adminRows} servers={serverList} access={accessSet} />

        <section className="dash-panel glass-card" id="media-links">
          <div className="dash-panel-head">
            <div className="icon-badge">
              <Link2 size={18} />
            </div>
            <div className="titles">
              <h2>Media Links</h2>
              <p>View and manage approved media links.</p>
            </div>
          </div>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Public ID</th>
                <th>Type</th>
                <th>Server</th>
                <th>Status</th>
                <th>Hits</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(links || []).map((l) => (
                <tr key={l.id}>
                  <td style={{ fontFamily: "monospace", display: "flex", alignItems: "center", gap: 6 }}>
                    {l.public_id}
                    <CopyButton text={l.public_id} />
                  </td>
                  <td>
                    <span className={`pill ${l.media_type === "hls" ? "pill-violet" : "pill-blue"}`}>{l.media_type}</span>
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 12 }}>
                    {l.server_id ? serverNameById.get(l.server_id) || "(deleted server)" : "default (env)"}
                  </td>
                  <td>
                    <span className="status-cell">
                      <span
                        className="status-dot"
                        style={{ background: l.status === "active" ? "var(--green)" : "var(--red)", boxShadow: "none" }}
                      />
                      {l.status}
                    </span>
                  </td>
                  <td>{l.hit_count}</td>
                  <td>{l.expires_at ? new Date(l.expires_at).toLocaleString() : "—"}</td>
                  <td>
                    {l.status === "active" && (
                      <form action={revoke}>
                        <input type="hidden" name="linkId" value={l.id} />
                        <button className="btn-sm btn-sm-danger">
                          <Trash2 size={12} /> Revoke
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="dash-panel glass-card" id="domains">
          <div className="dash-panel-head">
            <div className="icon-badge">
              <Shield size={18} />
            </div>
            <div className="titles">
              <h2>Approved Media Domains</h2>
              <p>Domains allowed for media access.</p>
            </div>
          </div>
          <form action={addDomain} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input name="hostname" className="field-input" placeholder="cdn.example.com" style={{ flex: 1 }} />
            <button className="btn-sm btn-sm-primary" style={{ padding: "10px 18px" }}>
              <Plus size={14} /> Add
            </button>
          </form>
          <table className="dash-table">
            <tbody>
              {(domains || []).map((d) => (
                <tr key={d.id}>
                  <td>{d.hostname}</td>
                  <td style={{ textAlign: "right" }}>
                    <form action={removeDomain}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="hostname" value={d.hostname} />
                      <button className="btn-sm btn-sm-danger">
                        <Trash2 size={12} /> Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {!domains?.length && (
                <tr>
                  <td colSpan={2} style={{ textAlign: "center", color: "var(--muted)", padding: "16px 0" }}>
                    No domains approved yet — nothing can be fetched until you add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="dash-panel glass-card" id="audit-logs">
          <div className="dash-panel-head">
            <div className="icon-badge">
              <FileText size={18} />
            </div>
            <div className="titles">
              <h2>Recent Audit Log</h2>
              <p>Latest system activities and events.</p>
            </div>
          </div>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Event</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {(logs || []).map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td>
                    <span className={`pill ${ACTION_PILL[log.action] || "pill-blue"}`}>{log.action}</span>
                  </td>
                  <td style={{ color: "var(--muted)" }}>
                    {log.target_type}: {log.target_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
