import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import { api } from "../lib/api";
import { useNotifications } from "../hooks/useNotifications";
import { storage } from "../lib/storage";

type Props = {
  projectId?: string;
};

export function NotificationBell({ projectId }: Props) {
  const { t } = useI18n();
  const { notifications, unreadCount, refresh } = useNotifications(projectId ?? "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    if (!projectId) return;
    await api.markNotificationsRead(projectId, {});
    refresh();
  };

  const typeIcon: Record<string, string> = {
    irr_low: "⚠️",
    conflict_detected: "⚡",
    scheme_updated: "📝",
    member_joined: "👋",
    message: "💬",
    al_complete: "🤖",
    conflict_resolved: "✅"
  };

  if (!projectId) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((x) => !x)}
        style={{
          background: "none",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          padding: "0.4rem 0.65rem",
          cursor: "pointer",
          position: "relative",
          fontSize: "1.1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.35rem"
        }}
        title={t("notifications.title")}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: "absolute",
            top: "-4px",
            right: "-4px",
            background: "#ef4444",
            color: "#fff",
            borderRadius: "50%",
            fontSize: "0.65rem",
            width: "16px",
            height: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 8px)",
          width: "340px",
          maxHeight: "480px",
          background: "var(--surface)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}>
          {/* Header */}
          <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600 }}>{t("notifications.title")}</span>
            {unreadCount > 0 && (
              <button className="btn sm" onClick={markAllRead} style={{ fontSize: "0.78rem" }}>
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                🔕 {t("notifications.empty")}
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.notification_id}
                  style={{
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid var(--border-color)",
                    background: n.is_read ? "transparent" : "rgba(99,102,241,0.04)",
                    display: "flex",
                    gap: "0.6rem",
                    alignItems: "flex-start"
                  }}
                >
                  <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>{typeIcon[n.type] ?? "🔔"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: n.is_read ? 400 : 600, fontSize: "0.88rem", marginBottom: "0.2rem" }}>{n.title}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>{n.body}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                    </div>
                  </div>
                  {!n.is_read && (
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#6366f1", flexShrink: 0, marginTop: "4px" }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
