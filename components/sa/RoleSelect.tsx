"use client";

import { useTransition } from "react";
import { Crown } from "lucide-react";

type Role = "user" | "admin" | "super_admin";

export default function RoleSelect({
  userId,
  currentRole,
  onChangeRole,
}: {
  userId: string;
  currentRole: Role;
  onChangeRole: (userId: string, role: Role) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className={`role-select-wrap role-${currentRole}`} style={{ opacity: isPending ? 0.6 : 1 }}>
      {currentRole === "super_admin" && (
        <Crown size={13} style={{ position: "absolute", left: 9, pointerEvents: "none" }} />
      )}
      <select
        defaultValue={currentRole}
        disabled={isPending}
        style={currentRole === "super_admin" ? { paddingLeft: 26 } : undefined}
        onChange={(e) => {
          const role = e.target.value as Role;
          startTransition(() => {
            onChangeRole(userId, role);
          });
        }}
      >
        <option value="user">User</option>
        <option value="admin">Admin</option>
        <option value="super_admin">Super Admin</option>
      </select>
    </div>
  );
}
