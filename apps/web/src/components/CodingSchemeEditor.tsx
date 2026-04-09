import { useMemo, useState } from "react";
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

function codeset(codes: CodeLabel[]) {
  return new Set(codes.map((c) => c.code));
}

/** Depth-first order for tree display (roots first, then children). */
function treeOrdered(codes: CodeLabel[]): Array<{ node: CodeLabel; depth: number; flatIndex: number }> {
  const known = codeset(codes);
  const out: Array<{ node: CodeLabel; depth: number; flatIndex: number }> = [];
  const seen = new Set<string>();

  const roots = codes.filter((c) => !c.parent_code || !known.has(c.parent_code));
  roots.sort((a, b) => a.code.localeCompare(b.code));

  function visit(node: CodeLabel, depth: number) {
    if (seen.has(node.code)) return;
    seen.add(node.code);
    const flatIndex = codes.findIndex((x) => x.code === node.code);
    out.push({ node, depth, flatIndex });
    const kids = codes.filter((c) => c.parent_code === node.code).sort((a, b) => a.code.localeCompare(b.code));
    for (const k of kids) visit(k, depth + 1);
  }
  for (const r of roots) visit(r, 0);
  for (const c of codes) {
    if (!seen.has(c.code)) visit(c, 0);
  }
  return out;
}

export function CodingSchemeEditor({ value, onChange, readonly = false }: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<CodeLabel>({ code: "", description: "" });
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropParent, setDropParent] = useState<string | null>(null);

  const ordered = useMemo(() => treeOrdered(value), [value]);

  const startAdd = () => {
    setDraft({ code: "", description: "", color: DEFAULT_COLORS[value.length % DEFAULT_COLORS.length] });
    setEditing(-1);
  };

  const startEdit = (flatIndex: number) => {
    setDraft({ ...value[flatIndex] });
    setEditing(flatIndex);
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

  const remove = (flatIndex: number) => {
    onChange(value.filter((_, idx) => idx !== flatIndex));
  };

  const moveCode = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= value.length || to >= value.length) return;
    const next = [...value];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    onChange(next);
  };

  const setParentByFlatIndex = (childFlat: number, newParentCode: string | undefined) => {
    const child = value[childFlat];
    if (!child) return;
    if (newParentCode === child.code) return;
    if (newParentCode) {
      let p: string | undefined = newParentCode;
      const byCode = new Map(value.map((c) => [c.code, c]));
      while (p) {
        if (p === child.code) return;
        p = byCode.get(p)?.parent_code;
      }
    }
    const next = value.map((c, i) => (i === childFlat ? { ...c, parent_code: newParentCode } : c));
    onChange(next);
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0 }}>{t("settings.scheme")}</h3>
        {!readonly && (
          <button className="btn primary sm" onClick={startAdd}>{t("scheme.addCode")}</button>
        )}
      </div>

      {!readonly && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragFrom === null) return;
            setParentByFlatIndex(dragFrom, undefined);
            setDragFrom(null);
            setDropParent(null);
          }}
          style={{
            marginBottom: 8,
            padding: "8px 10px",
            borderRadius: 8,
            border: dropParent === "__root__" ? "2px dashed var(--accent)" : "1px dashed var(--border-color)",
            fontSize: 12,
            color: "var(--text-muted)",
            textAlign: "center"
          }}
        >
          拖到此处可设为根编码（清除父级）
        </div>
      )}

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
                <button
                  key={c}
                  type="button"
                  aria-label={`${t("scheme.codeColor")} ${c}`}
                  onClick={() => setDraft((d) => ({ ...d, color: c }))}
                  style={{
                    width: "20px", height: "20px", borderRadius: "50%", background: c, cursor: "pointer",
                    border: draft.color === c ? "3px solid var(--text-primary)" : "2px solid transparent",
                    transition: "border 0.15s",
                    padding: 0
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

      {/* Tree list */}
      {value.length === 0 ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "1.5rem 0" }}>{t("scheme.empty")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {ordered.map(({ node: code, depth, flatIndex: i }) => (
            <div
              key={code.code + i}
              draggable={!readonly}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => {
                if (readonly) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                if (readonly) return;
                e.preventDefault();
                if (dragFrom !== null) {
                  if (e.shiftKey) {
                    moveCode(dragFrom, i);
                  } else {
                    setParentByFlatIndex(dragFrom, code.code);
                  }
                }
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
              style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.65rem 0.75rem",
              paddingLeft: `${12 + depth * 18}px`,
              background: "var(--surface-raised)",
              borderRadius: "8px",
              borderLeft: `4px solid ${code.color ?? "#6366f1"}`,
              cursor: readonly ? "default" : "grab",
              opacity: dragFrom === i ? 0.65 : 1
            }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {depth > 0 && <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>└</span>}
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
                {!readonly && (
                  <p style={{ margin: "0.35rem 0 0", fontSize: "0.68rem", color: "var(--text-muted)" }}>
                    拖拽到另一行：设为子编码；Shift+拖放：同层级排序
                  </p>
                )}
              </div>
              {!readonly && (
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button aria-label={t("common.save")} className="btn sm" onClick={() => startEdit(i)} style={{ padding: "0.2rem 0.5rem" }}>✎</button>
                  <button aria-label={t("projects.delete")} className="btn sm" onClick={() => remove(i)} style={{ padding: "0.2rem 0.5rem", color: "#ef4444" }}>✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
