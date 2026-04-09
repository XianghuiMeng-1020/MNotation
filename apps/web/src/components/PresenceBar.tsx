import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function PresenceBar({ projectId }: { projectId: string }) {
  const [online, setOnline] = useState<Array<{ user_id: string; display_name?: string; email?: string }>>([]);

  useEffect(() => {
    if (!projectId) return;
    const tick = () => {
      api.postPresence(projectId, {}).catch(() => undefined);
      api.getPresence(projectId).then((r: any) => setOnline(r.online ?? [])).catch(() => setOnline([]));
    };
    tick();
    const id = window.setInterval(tick, 45_000);
    return () => window.clearInterval(id);
  }, [projectId]);

  if (online.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12, color: "var(--color-text-muted)" }}>
      <span>Online:</span>
      {online.map((u) => (
        <span key={u.user_id} title={u.email} style={{ padding: "2px 8px", borderRadius: 999, background: "var(--color-surface-hover)" }}>
          {(u.display_name || u.email || u.user_id).slice(0, 16)}
        </span>
      ))}
    </div>
  );
}
