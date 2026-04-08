import { useState } from "react";
import { useI18n } from "../lib/i18n";
import { api } from "../lib/api";

export type Conflict = {
  conflict_id: string;
  project_id: string;
  item_id: string;
  labels_json: string;
  status: "open" | "discussing" | "resolved";
  resolved_label?: string | null;
  resolved_by?: string | null;
  resolution_note?: string | null;
  detected_at: string;
  resolved_at?: string | null;
  content_text?: string;
};

type Props = {
  conflicts: Conflict[];
  projectId: string;
  onUpdate?: () => void;
};

export function ConflictPanel({ conflicts, projectId, onUpdate }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Conflict | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "discussing" | "resolved">("all");
  const [resolvedLabel, setResolvedLabel] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = conflicts.filter((c) => filterStatus === "all" || c.status === filterStatus);

  const selectConflict = async (c: Conflict) => {
    setSelected(c);
    setResolvedLabel(c.resolved_label ?? "");
    setResolutionNote(c.resolution_note ?? "");
    try {
      const res = await api.getConflictMessages(projectId, c.conflict_id) as any;
      setMessages(res.messages ?? []);
    } catch { /* ignore */ }
  };

  const resolve = async () => {
    if (!selected || !resolvedLabel.trim()) return;
    setSaving(true);
    try {
      await api.resolveConflict(projectId, selected.conflict_id, { resolved_label: resolvedLabel, resolution_note: resolutionNote });
      onUpdate?.();
      setSelected({ ...selected, status: "resolved", resolved_label: resolvedLabel });
    } finally { setSaving(false); }
  };

  const reopen = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.reopenConflict(projectId, selected.conflict_id);
      onUpdate?.();
      setSelected({ ...selected, status: "open", resolved_label: null });
    } finally { setSaving(false); }
  };

  const sendMessage = async () => {
    if (!selected || !newMessage.trim()) return;
    await api.postMessage(projectId, { content: newMessage, message_type: "chat", conflict_id: selected.conflict_id });
    setMessages((prev) => [...prev, { content: newMessage, created_at: new Date().toISOString(), user_id: "me" }]);
    setNewMessage("");
  };

  const labelsForConflict = (c: Conflict): Record<string, string> => {
    try { return JSON.parse(c.labels_json); } catch { return {}; }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      open: "#ef4444", discussing: "#f97316", resolved: "#22c55e"
    };
    return (
      <span style={{ background: map[status] ?? "#888", color: "#fff", borderRadius: "999px", fontSize: "0.72rem", padding: "0.15rem 0.6rem", fontWeight: 600 }}>
        {t(`conflicts.${status}` as any)}
      </span>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "1rem", minHeight: "60vh" }}>
      {/* Left: conflict list */}
      <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border-color)", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {(["all", "open", "discussing", "resolved"] as const).map((s) => (
            <button key={s} className={`btn sm ${filterStatus === s ? "primary" : ""}`} onClick={() => setFilterStatus(s)}>
              {t(`conflicts.${s}` as any)} ({s === "all" ? conflicts.length : conflicts.filter((c) => c.status === s).length})
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>{t("conflicts.empty")}</div>
          ) : (
            filtered.map((c) => {
              const labels = labelsForConflict(c);
              return (
                <div
                  key={c.conflict_id}
                  onClick={() => selectConflict(c)}
                  style={{
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid var(--border-color)",
                    cursor: "pointer",
                    background: selected?.conflict_id === c.conflict_id ? "var(--surface-raised)" : "transparent",
                    transition: "background 0.15s"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Item: {c.item_id.slice(0, 12)}…</span>
                    {statusBadge(c.status)}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {Object.entries(labels).map(([userId, label]) => (
                      <span key={userId} style={{ background: "var(--surface-raised)", borderRadius: "4px", padding: "0.1rem 0.4rem" }}>
                        {userId.slice(-6)}: <strong>{label}</strong>
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                    {new Date(c.detected_at).toLocaleDateString()}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: conflict detail */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
            Select a conflict to view details
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>{t("conflicts.coderLabels")}</h3>
              {statusBadge(selected.status)}
            </div>

            {selected.content_text && (
              <div style={{ background: "var(--surface-raised)", borderRadius: "8px", padding: "0.75rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
                {selected.content_text}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {Object.entries(labelsForConflict(selected)).map(([userId, label]) => (
                <div key={userId} style={{ background: "var(--surface-raised)", borderRadius: "8px", padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>{userId.slice(-12)}: </span>
                  <strong>{label}</strong>
                </div>
              ))}
            </div>

            {selected.status !== "resolved" && (
              <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <h4>{t("conflicts.resolve")}</h4>
                <input
                  className="input"
                  placeholder={t("conflicts.resolvedLabel")}
                  value={resolvedLabel}
                  onChange={(e) => setResolvedLabel(e.target.value)}
                  style={{ marginBottom: "0.5rem" }}
                />
                <textarea
                  className="input"
                  placeholder={t("conflicts.resolutionNote")}
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  rows={2}
                  style={{ marginBottom: "0.5rem" }}
                />
                <button className="btn primary" onClick={resolve} disabled={saving || !resolvedLabel.trim()}>
                  {saving ? t("common.loading") : t("conflicts.resolve")}
                </button>
              </div>
            )}

            {selected.status === "resolved" && (
              <div style={{ background: "rgba(34,197,94,0.08)", borderRadius: "8px", padding: "0.75rem" }}>
                <p style={{ margin: "0 0 0.4rem" }}><strong>{t("conflicts.resolvedLabel")}:</strong> {selected.resolved_label}</p>
                {selected.resolution_note && <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>{selected.resolution_note}</p>}
                <button className="btn sm" onClick={reopen} disabled={saving} style={{ marginTop: "0.5rem" }}>
                  {t("conflicts.reopen")}
                </button>
              </div>
            )}

            {/* Discussion thread */}
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
              <h4 style={{ marginBottom: "0.5rem" }}>{t("conflicts.discussion")}</h4>
              <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.5rem" }}>
                {messages.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{t("chat.noMessages")}</p>
                ) : messages.map((msg, i) => (
                  <div key={i} style={{ background: "var(--surface-raised)", borderRadius: "6px", padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600, marginRight: "0.4rem" }}>{msg.user_id?.slice(-8) ?? "?"}</span>
                    {msg.content}
                    <span style={{ float: "right", fontSize: "0.72rem", color: "var(--text-muted)" }}>{msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ""}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  className="input"
                  placeholder={t("chat.placeholder")}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  style={{ flex: 1 }}
                />
                <button className="btn primary sm" onClick={sendMessage}>{t("chat.send")}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
