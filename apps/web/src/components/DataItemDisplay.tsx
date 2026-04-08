export function DataItemDisplay({ item }: { item: { item_id: string; content_text: string; context_json?: any } | null }) {
  if (!item) return <div className="card">No item.</div>;
  return (
    <div className="card">
      <h3>Item {item.item_id}</h3>
      <p>{item.content_text}</p>
      {item.context_json ? <pre>{JSON.stringify(item.context_json, null, 2)}</pre> : null}
    </div>
  );
}
