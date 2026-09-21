"use client";

import { useTransition } from "react";

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
    <select
      defaultValue={currentRole}
      className="field-input"
      style={{ padding: "4px 6px", fontSize: 12, opacity: isPending ? 0.6 : 1 }}
      disabled={isPending}
      onChange={(e) => {
        const role = e.target.value as Role;
        startTransition(() => {
          onChangeRole(userId, role);
        });
      }}
    >
      <option value="user">user</option>
      <option value="admin">admin</option>
      <option value="super_admin">super_admin</option>
    </select>
  );
}
