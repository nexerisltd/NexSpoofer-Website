"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock } from "lucide-react";

export default function LiveStatusWidget() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Intentional exception to react-hooks/set-state-in-effect: the actual
    // wall-clock time can only be known on the client, and computing it
    // during the initial render (even via a lazy useState initializer)
    // would run on the server too and mismatch whatever time the client
    // actually hydrates at — this effect exists specifically to defer that
    // to a client-only pass, which is the documented exception to the rule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  // Render nothing until mounted — avoids a server/client time mismatch
  // (hydration error) since the server-rendered time would differ from
  // whatever moment the client actually hydrates at.
  if (!now) return <div className="status-widget" style={{ visibility: "hidden" }} />;

  const dateStr = now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="status-widget">
      <span>
        <span className="status-dot" />
        System Online
      </span>
      <span className="divider" />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Calendar size={13} /> {dateStr}
      </span>
      <span className="divider" />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Clock size={13} /> {timeStr}
      </span>
    </div>
  );
}
