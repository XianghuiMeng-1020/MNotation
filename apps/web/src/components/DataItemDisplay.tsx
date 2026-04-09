import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type Item = { item_id: string; content_text: string; context_json?: any };

export function DataItemDisplay({
  item,
  projectId,
  labels = []
}: {
  item: Item | null;
  projectId?: string;
  labels?: string[];
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [spanNote, setSpanNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSpanNote("");
  }, [item?.item_id]);

  if (!item) return <div className="card">No item.</div>;

  const onMouseUp = async () => {
    if (!projectId || labels.length === 0) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = item.content_text ?? "";
    const start = text.indexOf(sel.toString());
    if (start < 0 || !sel.toString().trim()) return;
    const end = start + sel.toString().length;
    const label = window.prompt(`Label span [${start}-${end}] as:`, labels[0]);
    if (!label || !labels.includes(label)) return;
    setSaving(true);
    try {
      await api.postSpanAnnotation(projectId, { item_id: item.item_id, start_offset: start, end_offset: end, label });
      setSpanNote(`Saved span → ${label}`);
    } catch (e: any) {
      setSpanNote(e?.message ?? "Span save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h3>Item {item.item_id}</h3>
      <p ref={ref} onMouseUp={onMouseUp} style={{ userSelect: "text", lineHeight: 1.65 }}>
        {item.content_text}
      </p>
      {projectId && labels.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Select text to create a span annotation (V3). {saving ? "Saving…" : spanNote}
        </p>
      )}
      {item.context_json ? <pre>{JSON.stringify(item.context_json, null, 2)}</pre> : null}
    </div>
  );
}
