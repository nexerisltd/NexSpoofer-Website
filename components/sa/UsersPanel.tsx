"use client";

import { useMemo, useState, useTransition } from "react";
import { Users, Search } from "lucide-react";
import RoleSelect from "./RoleSelect";
import { updateUserRole, setUserStatus } from "@/app/sa/actions";

type Profile = {
  id: string;
  email: string;
  role: "user" | "admin" | "super_admin";
  status: "active" | "suspended";
};

function StatusToggle({ userId, status }: { userId: string; status: "active" | "suspended" }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      className={status === "active" ? "btn-sm btn-sm-primary" : "btn-sm btn-sm-ghost"}
      disabled={isPending}
      style={{ opacity: isPending ? 0.6 : 1 }}
      onClick={() => startTransition(() => setUserStatus(userId, status === "active" ? "suspended" : "active"))}
    >
      {status === "active" ? "Suspend" : "Reactivate"}
    </button>
  );
}

export default function UsersPanel({ profiles }: { profiles: Profile[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.email.toLowerCase().includes(q));
  }, [profiles, query]);

  return (
    <section className="dash-panel glass-card" id="users">
      <div className="dash-panel-head">
        <div className="icon-badge">
          <Users size={18} />
        </div>
        <div className="titles">
          <h2>Users</h2>
          <p>Manage registered users and their access.</p>
        </div>
        <div className="spacer" />
        <div className="search-box">
          <Search size={14} color="var(--muted)" />
          <input placeholder="Search users…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <table className="dash-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td>{p.email}</td>
              <td>
                <RoleSelect userId={p.id} currentRole={p.role} onChangeRole={updateUserRole} />
              </td>
              <td>
                <span className="status-cell">
                  <span className="status-dot" style={{ background: p.status === "active" ? "var(--green)" : "var(--red)", boxShadow: "none" }} />
                  {p.status}
                </span>
              </td>
              <td>
                <StatusToggle userId={p.id} status={p.status} />
              </td>
            </tr>
          ))}
          {!filtered.length && (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: "20px 0" }}>
                No users match &ldquo;{query}&rdquo;.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
