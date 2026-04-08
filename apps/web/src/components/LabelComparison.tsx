export function LabelComparison({ manualLabel, llmLabel }: { manualLabel?: string; llmLabel?: string }) {
  return (
    <div className="card">
      <h4>Label Comparison</h4>
      <p>Manual: {manualLabel ?? "-"}</p>
      <p>LLM: {llmLabel ?? "-"}</p>
      <p className="muted">{manualLabel && llmLabel ? (manualLabel === llmLabel ? "Consistent" : "Conflict") : "Incomplete"}</p>
    </div>
  );
}
