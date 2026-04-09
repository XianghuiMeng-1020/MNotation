import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { CodeLabel } from "./CodingSchemeEditor";

type Example = { item_id: string; example_label: string; note?: string };

export function FewShotManager({ projectId, scheme }: { projectId: string; scheme: CodeLabel[] }) {
  const [examples, setExamples] = useState<Example[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [pickItem, setPickItem] = useState<{ item_id: string; content_text?: string } | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [candidates, setCandidates] = useState<Array<{ item_id: string; content_text?: string }>>([]);

  const allowed = useMemo(() => new Set(scheme.map((c) => c.code)), [scheme]);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r: any = await api.getFewShot(projectId);
      setExamples((r.examples ?? []).map((e: any) => ({ item_id: e.item_id, example_label: e.example_label, note: e.note ?? "" })));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const searchItems = useCallback(async () => {
    const q = search.trim();
    if (q.length < 2) {
      setCandidates([]);
      return;
    }
    const all: Array<{ item_id: string; content_text?: string }> = [];
    let cursor = 0;
    for (let i = 0; i < 20 && all.length < 80; i++) {
      const r: any = await api.getDataItems(projectId, { cursor, limit: 200 });
      const chunk = r.items ?? [];
      for (const it of chunk) {
        const id = String(it.item_id ?? "");
        const tx = String(it.content_text ?? "").toLowerCase();
        if (id.includes(q) || tx.includes(q.toLowerCase())) all.push(it);
        if (all.length >= 80) break;
      }
      if (!r.paging?.has_more) break;
      cursor = Number(r.paging?.next_cursor ?? 0);
    }
    setCandidates(all);
  }, [projectId, search]);

  const saveAll = async () => {
    setSaving(true);
    try {
      await api.setFewShot(projectId, { examples });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const addExample = () => {
    if (!pickItem || !labelDraft.trim()) return;
    if (!allowed.has(labelDraft.trim())) return;
    if (examples.some((e) => e.item_id === pickItem.item_id)) return;
    setExamples((prev) => [...prev, { item_id: pickItem.item_id, example_label: labelDraft.trim(), note: noteDraft.trim() }]);
    setPickItem(null);
    setLabelDraft("");
    setNoteDraft("");
    setSearch("");
    setCandidates([]);
  };

  const remove = (itemId: string) => {
    setExamples((prev) => prev.filter((e) => e.item_id !== itemId));
  };

  if (loading) return <p style={{ fontSize: 13 }}>…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
        从数据项中挑选最多 20 条「金标」示例，用于 Few-shot 提示词（需先配置编码表）。
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>搜索条目</label>
          <input
            className="input"
            placeholder="item_id 或正文关键词…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={searchItems}
            onKeyDown={(e) => e.key === "Enter" && searchItems()}
          />
        </div>
        <button type="button" className="btn sm" onClick={searchItems}>
          搜索
        </button>
      </div>
      {candidates.length > 0 && (
        <div style={{ maxHeight: 160, overflow: "auto", border: "1px solid var(--border-color)", borderRadius: 8, padding: 8 }}>
          {candidates.map((c) => (
            <button
              key={c.item_id}
              type="button"
              onClick={() => setPickItem(c)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                marginBottom: 4,
                border: pickItem?.item_id === c.item_id ? "2px solid var(--accent)" : "1px solid var(--border-color)",
                borderRadius: 6,
                background: "var(--surface-raised)",
                cursor: "pointer",
                fontSize: 12
              }}
            >
              <strong>{c.item_id}</strong> — {(c.content_text ?? "").slice(0, 120)}
            </button>
          ))}
        </div>
      )}
      {pickItem && (
        <div style={{ padding: 12, background: "var(--surface-raised)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, marginBottom: 8 }}>已选: <strong>{pickItem.item_id}</strong></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select className="input" value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} style={{ minWidth: 140 }}>
              <option value="">选择标签…</option>
              {scheme.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
            <input className="input" placeholder="备注（可选）" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
            <button type="button" className="btn primary sm" onClick={addExample} disabled={!labelDraft}>
              加入列表
            </button>
          </div>
        </div>
      )}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>当前示例 ({examples.length}/20)</div>
        {examples.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>暂无</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {examples.map((e) => (
              <li key={e.item_id} style={{ marginBottom: 6 }}>
                <code>{e.item_id}</code> → <strong>{e.example_label}</strong>
                {e.note ? <span style={{ color: "var(--text-muted)" }}> ({e.note})</span> : null}{" "}
                <button type="button" className="btn sm" style={{ padding: "0 6px" }} onClick={() => remove(e.item_id)}>
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="btn primary" disabled={saving} onClick={saveAll}>
        {saving ? "保存中…" : "保存到服务器"}
      </button>
    </div>
  );
}
