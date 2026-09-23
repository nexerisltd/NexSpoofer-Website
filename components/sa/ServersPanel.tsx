import { Server, Plus, Trash2 } from "lucide-react";
import { addServer, setServerEnabled, removeServer } from "@/app/sa/actions";
import type { MediaServer } from "@/lib/servers";
import ServerHealthCheck from "./ServerHealthCheck";

export default function ServersPanel({ servers }: { servers: MediaServer[] }) {
  async function add(formData: FormData) {
    "use server";
    await addServer(String(formData.get("name")), String(formData.get("workerUrl")));
  }
  async function toggle(formData: FormData) {
    "use server";
    await setServerEnabled(String(formData.get("id")), formData.get("enabled") === "true");
  }
  async function remove(formData: FormData) {
    "use server";
    await removeServer(String(formData.get("id")), String(formData.get("name")));
  }

  return (
    <section className="dash-panel glass-card" id="servers">
      <div className="dash-panel-head">
        <div className="icon-badge">
          <Server size={18} />
        </div>
        <div className="titles">
          <h2>Media Servers</h2>
          <p>Each server is a separate Worker deployment (e.g. one per provider). Assign admins to specific servers below.</p>
        </div>
      </div>

      <form action={add} style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input name="name" className="field-input" placeholder="Server name (e.g. Provider A)" style={{ flex: "1 1 200px" }} required />
        <input
          name="workerUrl"
          className="field-input"
          placeholder="https://nexspoofer-media-2.yoursubdomain.workers.dev"
          style={{ flex: "2 1 320px" }}
          required
        />
        <button className="btn-sm btn-sm-primary" style={{ padding: "10px 18px" }}>
          <Plus size={14} /> Add
        </button>
      </form>

      <table className="dash-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Worker URL</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {servers.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td style={{ fontFamily: "monospace", fontSize: 11.5, color: "var(--muted)" }}>{s.worker_url}</td>
              <td>
                <span className="status-cell">
                  <span className="status-dot" style={{ background: s.enabled ? "var(--green)" : "var(--red)", boxShadow: "none" }} />
                  {s.enabled ? "enabled" : "disabled"}
                </span>
              </td>
              <td style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                <ServerHealthCheck serverId={s.id} />
                <form action={toggle}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="enabled" value={String(!s.enabled)} />
                  <button className="btn-sm btn-sm-ghost">{s.enabled ? "Disable" : "Enable"}</button>
                </form>
                <form action={remove}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="name" value={s.name} />
                  <button className="btn-sm btn-sm-danger">
                    <Trash2 size={12} /> Remove
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {!servers.length && (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: "16px 0" }}>
                No servers added yet — LinkGen has nothing to generate against until you add at least one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
