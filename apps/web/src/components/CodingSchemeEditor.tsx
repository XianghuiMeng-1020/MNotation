import { useState } from "react";
import { useI18n } from "../lib/i18n";

export type CodeLabel = {
  code: string;
  description: string;
  color?: string;
  parent_code?: string;
};

type Props = {
  value: CodeLabel[];
  onChange: (codes: CodeLabel[]) => void;
  readonly?: boolean;
};

const DEFAULT_COLORS = ["#6366f1", "#ec4899", "#22c55e", "#f97316", "#06b6d4", "#8b5cf6", "#ef4444", "#eab308"];

export function CodingSchemeEditor({ value, onChange, readonly = false }: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<CodeLabel>({ code: "", description: "" });

  const startAdd = () => {
    setDraft({ code: "", description: "", color: DEFAULT_COLORS[value.length % DEFAULT_COLORS.length] });
    setEditing(-1);
  };

  const startEdit = (i: number) => {
    setDraft({ ...value[i] });
    setEditing(i);
  };

  const commitEdit = () => {
    if (!draft.code.trim()) return;
    const cleaned = { ...draft, code: draft.code.toUpperCase().replace(/\s+/g, "_") };
    if (editing === -1) {
      onChange([...value, cleaned]);
    } else if (editing !== null) {
      const next = [...value];
      next[editing] = cleaned;
      onChange(next);
    }
    setEditing(null);
  };

  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0 }}>{t("settings.scheme")}</h3>
        {!readonly && (
          <button className="btn primary sm" onClick={startAdd}>{t("scheme.addCode")}</button>
        )}
      </div>

      {/* Edit form */}
      {editing !== null && (
        <div style={{ background: "var(--surface-raised)", borderRadius: "10px", padding: "1rem", marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            <div>
              <label style={{ fontSize: "0.8rem", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>{t("scheme.code")} *</label>
              <input
                className="input"
                placeholder={t("scheme.codePlaceholder")}
                value={draft.code}
                onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label style={{ fontSize: "0.8rem", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>{t("scheme.parentCode")}</label>
              <select className="input" value={draft.parent_code ?? ""} onChange={(e) => setDraft((d) => ({ ...d, parent_code: e.target.value || undefined }))}>
                <option value="">—</option>
                {value.filter((_, i) => i !== editing).map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>{t("scheme.codeDescription")}</label>
            <textarea
              className="input"
              placeholder={t("scheme.descPlaceholder")}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              rows={2}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 500 }}>{t("scheme.codeColor")}</label>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              {DEFAULT_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setDraft((d) => ({ ...d, color: c }))}
                  style={{
                    width: "20px", height: "20px", borderRadius: "50%", background: c, cursor: "pointer",
                    border: draft.color === c ? "3px solid var(--text-primary)" : "2px solid transparent",
                    transition: "border 0.15s"
                  }}
                />
              ))}
              <input type="color" value={draft.color ?? "#6366f1"} onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))} style={{ width: "24px", height: "24px", borderRadius: "50%", border: "none", cursor: "pointer", padding: 0 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn primary sm" onClick={commitEdit} disabled={!draft.code.trim()}>{t("common.save")}</button>
            <button className="btn sm" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
          </div>
        </div>
      )}

      {/* Code list */}
      {value.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "1.5rem 0" }}>{t("scheme.empty")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {value.map((code, i) => (
            <div key={code.code + i} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.65rem 0.75rem",
              background: "var(--surface-raised)",
              borderRadius: "8px",
              borderLeft: `4px solid ${code.color ?? "#6366f1"}`
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.9rem" }}>{code.code}</span>
                  {code.parent_code && (
                    <span style={{ fontSize: "0.72rem", background: "var(--surface-raised)", borderRadius: "4px", padding: "0.1rem 0.4rem", color: "var(--text-muted)" }}>
                      ↳ {code.parent_code}
                    </span>
                  )}
                </div>
                {code.description && (
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.4 }}>{code.description}</p>
                )}
              </div>
              {!readonly && (
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button className="btn sm" onClick={() => startEdit(i)} style={{ padding: "0.2rem 0.5rem" }}>✎</button>
                  <button className="btn sm" onClick={() => remove(i)} style={{ padding: "0.2rem 0.5rem", color: "#ef4444" }}>✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
