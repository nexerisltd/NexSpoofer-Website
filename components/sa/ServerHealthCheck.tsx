"use client";

import { useState, useTransition } from "react";
import { Activity, Loader2 } from "lucide-react";
import { checkServerHealth, type ServerHealth } from "@/app/sa/actions";

export default function ServerHealthCheck({ serverId }: { serverId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ServerHealth | null>(null);

  function run() {
    startTransition(async () => {
      const r = await checkServerHealth(serverId);
      setResult(r);
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button type="button" className="btn-sm btn-sm-ghost" onClick={run} disabled={isPending}>
        {isPending ? <Loader2 size={12} className="spin" /> : <Activity size={12} />}
        Check
      </button>
      {result && (
        <span
          style={{ fontSize: 11, color: result.ok ? "var(--green)" : "var(--red)", maxWidth: 220 }}
          title={result.detail}
        >
          {result.ok ? "✓ up" : "✕ down"} ({result.ms}ms)
        </span>
      )}
    </div>
  );
}
