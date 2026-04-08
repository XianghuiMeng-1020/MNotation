import { useState } from "react";

export function DifficultyRanking({
  items,
  onSubmit
}: {
  items: Array<{ item_id: string; text: string }>;
  onSubmit: (ordering: string[]) => void;
}) {
  const [order, setOrder] = useState(items);
  return (
    <div className="card">
      <h3>Difficulty Ranking</h3>
      {order.map((item, idx) => (
        <div key={item.item_id} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <span>{idx + 1}</span>
          <span style={{ flex: 1 }}>{item.text.slice(0, 80)}</span>
          <button className="btn" disabled={idx === 0} onClick={() => setOrder((prev) => {
            const next = [...prev];
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            return next;
          })}>↑</button>
          <button className="btn" disabled={idx === order.length - 1} onClick={() => setOrder((prev) => {
            const next = [...prev];
            [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
            return next;
          })}>↓</button>
        </div>
      ))}
      <button className="btn primary" onClick={() => onSubmit(order.map((x) => x.item_id))}>Submit ranking</button>
    </div>
  );
}
