import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { List, type RowComponentProps } from "react-window";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

const ROW_H = 52;
const VIEWPORT = 420;

type Item = { item_id: string; content_text?: string; ordering?: number };

type RowData = { items: Item[] };

type Cond = { field: "text" | "id"; op: "contains" | "equals"; value: string };

function matchesCond(it: Item, c: Cond): boolean {
  const v = c.value.trim().toLowerCase();
  if (!v) return true;
  const id = String(it.item_id ?? "");
  const tx = String(it.content_text ?? "").toLowerCase();
  if (c.field === "id") {
    return c.op === "equals" ? id.toLowerCase() === v : id.toLowerCase().includes(v);
  }
  return c.op === "equals" ? tx === v : tx.includes(v);
}

function filterItems(items: Item[], conds: Cond[], mode: "AND" | "OR"): Item[] {
  const active = conds.filter((c) => c.value.trim());
  if (active.length === 0) return items;
  return items.filter((it) => {
    const parts = active.map((c) => matchesCond(it, c));
    return mode === "AND" ? parts.every(Boolean) : parts.some(Boolean);
  });
}

function DataRow({ index, style, items, ariaAttributes }: RowComponentProps<RowData>) {
  const it = items[index];
  if (!it) return <div style={style} {...ariaAttributes} />;
  return (
    <div
      {...ariaAttributes}
      style={{
        ...style,
        padding: "8px 12px",
        borderBottom: "1px solid var(--color-border)",
        fontSize: 13,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        boxSizing: "border-box"
      }}
      title={it.content_text}
    >
      <strong>{it.item_id}</strong> — {(it.content_text ?? "").slice(0, 80)}
    </div>
  );
}

export function DataItemsListPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [combine, setCombine] = useState<"AND" | "OR">("AND");
  const [conds, setConds] = useState<Cond[]>([{ field: "text", op: "contains", value: "" }]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [listWidth, setListWidth] = useState(640);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setListWidth(Math.max(320, el.clientWidth)));
    ro.observe(el);
    setListWidth(Math.max(320, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const all: Item[] = [];
      let cursor = 0;
      for (let i = 0; i < 50; i++) {
        const r: any = await api.getDataItems(projectId, { cursor, limit: 500 });
        const chunk = r.items ?? [];
        all.push(...chunk);
        if (!r.paging?.has_more) break;
        cursor = Number(r.paging?.next_cursor ?? 0);
      }
      setItems(all);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => filterItems(items, conds, combine), [items, conds, combine]);

  const rowProps = useMemo((): RowData => ({ items: filtered }), [filtered]);

  const addCond = () => setConds((c) => [...c, { field: "text", op: "contains", value: "" }]);
  const removeCond = (i: number) => setConds((c) => c.filter((_, j) => j !== i));

  return (
    <div className="page">
      <Link to={`/projects/${projectId}`} style={{ fontSize: 13 }}>← {t("projects.backToProject")}</Link>
      <h2 style={{ marginTop: 12 }}>Data items</h2>

      <div style={{ marginBottom: 12, padding: 12, background: "var(--surface-raised)", borderRadius: 12, border: "1px solid var(--color-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>组合逻辑</span>
          <select className="input" value={combine} onChange={(e) => setCombine(e.target.value as "AND" | "OR")} style={{ width: 100 }}>
            <option value="AND">全部满足 (AND)</option>
            <option value="OR">任一满足 (OR)</option>
          </select>
          <button type="button" className="btn sm" onClick={addCond}>
            + 条件
          </button>
        </div>
        {conds.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <select className="input" value={c.field} onChange={(e) => setConds((prev) => prev.map((x, j) => (j === i ? { ...x, field: e.target.value as Cond["field"] } : x)))} style={{ width: 90 }}>
              <option value="text">正文</option>
              <option value="id">item_id</option>
            </select>
            <select className="input" value={c.op} onChange={(e) => setConds((prev) => prev.map((x, j) => (j === i ? { ...x, op: e.target.value as Cond["op"] } : x)))} style={{ width: 100 }}>
              <option value="contains">包含</option>
              <option value="equals">等于</option>
            </select>
            <input
              className="input"
              placeholder="关键词…"
              value={c.value}
              onChange={(e) => setConds((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              style={{ flex: 1, minWidth: 120 }}
            />
            {conds.length > 1 && (
              <button type="button" className="btn sm" onClick={() => removeCond(i)}>
                删除
              </button>
            )}
          </div>
        ))}
      </div>

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div ref={wrapRef}>
          <List<RowData>
            rowCount={filtered.length}
            rowHeight={ROW_H}
            rowProps={rowProps}
            rowComponent={DataRow}
            style={{
              height: VIEWPORT,
              width: listWidth,
              border: "1px solid var(--color-border)",
              borderRadius: 12
            }}
          />
        </div>
      )}
      <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{filtered.length} / {items.length} items</p>
    </div>
  );
}
