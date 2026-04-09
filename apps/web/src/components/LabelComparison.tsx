export function LabelComparison({
  manualLabel,
  llmLabel,
  confidence,
  reasoning
}: {
  manualLabel?: string;
  llmLabel?: string;
  confidence?: number | null;
  reasoning?: string | null;
}) {
  return (
    <div className="card">
      <h4>Label Comparison</h4>
      <p>Manual: {manualLabel ?? "-"}</p>
      <p>LLM: {llmLabel ?? "-"}</p>
      {confidence != null && (
        <p style={{ fontSize: 13 }}>
          Confidence: <strong>{(confidence * 100).toFixed(0)}%</strong>
        </p>
      )}
      {reasoning && (
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--color-text-secondary)" }}>
          <strong>LLM reasoning (CoT)</strong>
          <p style={{ marginTop: 4 }}>{reasoning}</p>
        </div>
      )}
      <p className="muted">{manualLabel && llmLabel ? (manualLabel === llmLabel ? "Consistent" : "Conflict") : "Incomplete"}</p>
    </div>
  );
}
