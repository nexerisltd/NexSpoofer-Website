import { notFound } from "next/navigation";
import Image from "next/image";
import { requireRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  updateUserRole,
  setUserStatus,
  revokeLink,
  addAllowedDomain,
  removeAllowedDomain,
} from "./actions";

export const metadata = { robots: { index: false, follow: false } };

export default async function SuperAdminPage() {
  const auth = await requireRole(["super_admin"]);
  // Deliberately 404, not 403/redirect — the existence of this route is
  // not meant to be discoverable by anyone who isn't already super_admin.
  if (!auth.ok) notFound();

  const supabase = createServiceClient();
  const [{ data: profiles }, { data: links }, { data: domains }, { data: logs }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("media_links").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("allowed_media_domains").select("*").order("created_at", { ascending: false }),
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(30),
  ]);

  async function changeRole(formData: FormData) {
    "use server";
    const userId = String(formData.get("userId"));
    const role = String(formData.get("role")) as "user" | "admin" | "super_admin";
    await updateUserRole(userId, role);
  }
  async function toggleStatus(formData: FormData) {
    "use server";
    const userId = String(formData.get("userId"));
    const status = String(formData.get("status")) as "active" | "suspended";
    await setUserStatus(userId, status);
  }
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
    <main className="page-shell" style={{ maxWidth: 980 }}>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image src="/logo.png" alt="" width={28} height={28} />
          <div className="brand-mark">NexSpoofer — Super Admin</div>
        </div>
      </div>

      <section className="glass-card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Users</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.6 }}>
              <th style={{ padding: "6px 8px" }}>Email</th>
              <th style={{ padding: "6px 8px" }}>Role</th>
              <th style={{ padding: "6px 8px" }}>Status</th>
              <th style={{ padding: "6px 8px" }} />
            </tr>
          </thead>
          <tbody>
            {(profiles || []).map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ padding: "6px 8px" }}>{p.email}</td>
                <td style={{ padding: "6px 8px" }}>
                  <form action={changeRole} style={{ display: "inline" }}>
                    <input type="hidden" name="userId" value={p.id} />
                    <select name="role" defaultValue={p.role} className="field-input" style={{ padding: "4px 6px", fontSize: 12 }}
                      onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                      <option value="super_admin">super_admin</option>
                    </select>
                  </form>
                </td>
                <td style={{ padding: "6px 8px" }}>{p.status}</td>
                <td style={{ padding: "6px 8px" }}>
                  <form action={toggleStatus} style={{ display: "inline" }}>
                    <input type="hidden" name="userId" value={p.id} />
                    <input type="hidden" name="status" value={p.status === "active" ? "suspended" : "active"} />
                    <button className="btn-primary" style={{ width: "auto", padding: "4px 10px", fontSize: 11.5 }}>
                      {p.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="glass-card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Media Links</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.6 }}>
              <th style={{ padding: "6px 8px" }}>Public ID</th>
              <th style={{ padding: "6px 8px" }}>Type</th>
              <th style={{ padding: "6px 8px" }}>Status</th>
              <th style={{ padding: "6px 8px" }}>Hits</th>
              <th style={{ padding: "6px 8px" }}>Expires</th>
              <th style={{ padding: "6px 8px" }} />
            </tr>
          </thead>
          <tbody>
            {(links || []).map((l) => (
              <tr key={l.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{l.public_id}</td>
                <td style={{ padding: "6px 8px" }}>{l.media_type}</td>
                <td style={{ padding: "6px 8px" }}>{l.status}</td>
                <td style={{ padding: "6px 8px" }}>{l.hit_count}</td>
                <td style={{ padding: "6px 8px" }}>{l.expires_at ? new Date(l.expires_at).toLocaleString() : "—"}</td>
                <td style={{ padding: "6px 8px" }}>
                  {l.status === "active" && (
                    <form action={revoke}>
                      <input type="hidden" name="linkId" value={l.id} />
                      <button className="btn-primary" style={{ width: "auto", padding: "4px 10px", fontSize: 11.5 }}>
                        Revoke
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="glass-card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Approved Media Domains</h2>
        <form action={addDomain} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input name="hostname" className="field-input" placeholder="cdn.example.com" />
          <button className="btn-primary" style={{ width: "auto", padding: "8px 16px" }}>Add</button>
        </form>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <tbody>
            {(domains || []).map((d) => (
              <tr key={d.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ padding: "6px 8px" }}>{d.hostname}</td>
                <td style={{ padding: "6px 8px" }}>
                  <form action={removeDomain}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="hostname" value={d.hostname} />
                    <button className="btn-primary" style={{ width: "auto", padding: "4px 10px", fontSize: 11.5 }}>
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="glass-card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Recent Audit Log</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {(logs || []).map((log) => (
              <tr key={log.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ padding: "5px 8px", opacity: 0.6, whiteSpace: "nowrap" }}>
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td style={{ padding: "5px 8px", fontFamily: "monospace" }}>{log.action}</td>
                <td style={{ padding: "5px 8px", opacity: 0.7 }}>
                  {log.target_type} · {log.target_id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
