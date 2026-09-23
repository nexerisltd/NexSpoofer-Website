"use client";

import { useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { setAdminServerAccess } from "@/app/sa/actions";
import type { MediaServer } from "@/lib/servers";

type AdminRow = { id: string; email: string; role: "admin" | "super_admin" };

function Cell({ adminId, serverId, checked }: { adminId: string; serverId: string; checked: boolean }) {
  const [isPending, startTransition] = useTransition();
  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      disabled={isPending}
      style={{ width: 16, height: 16, cursor: "pointer", opacity: isPending ? 0.5 : 1 }}
      onChange={(e) => {
        const next = e.target.checked;
        startTransition(() => {
          setAdminServerAccess(adminId, serverId, next);
        });
      }}
    />
  );
}

export default function ServerAccessPanel({
  admins,
  servers,
  access,
}: {
  admins: AdminRow[];
  servers: MediaServer[];
  /** Set of "adminId:serverId" strings that currently have access. */
  access: Set<string>;
}) {
  return (
    <section className="dash-panel glass-card" id="server-access">
      <div className="dash-panel-head">
        <div className="icon-badge">
          <ShieldCheck size={18} />
        </div>
        <div className="titles">
          <h2>Server Access</h2>
          <p>Which admin can generate links against which server. Super admins always have access to every enabled server.</p>
        </div>
      </div>

      {!servers.length ? (
        <p className="muted" style={{ margin: 0 }}>
          Add a server above first.
        </p>
      ) : !admins.length ? (
        <p className="muted" style={{ margin: 0 }}>
          No admins yet — promote a user to Admin from the Users panel first.
        </p>
      ) : (
        <table className="dash-table">
          <thead>
            <tr>
              <th>Admin</th>
              {servers.map((s) => (
                <th key={s.id} style={{ textAlign: "center" }}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.email}
                  {a.role === "super_admin" && (
                    <span className="pill pill-violet" style={{ marginLeft: 8 }}>
                      super
                    </span>
                  )}
                </td>
                {servers.map((s) => (
                  <td key={s.id} style={{ textAlign: "center" }}>
                    {a.role === "super_admin" ? (
                      <span className="muted" style={{ fontSize: 11 }}>
                        always
                      </span>
                    ) : (
                      <Cell adminId={a.id} serverId={s.id} checked={access.has(`${a.id}:${s.id}`)} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
