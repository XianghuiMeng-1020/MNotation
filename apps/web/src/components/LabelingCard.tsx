export function LabelingCard({
  labels,
  onSubmit
}: {
  labels: string[];
  onSubmit: (label: string) => void;
}) {
  return (
    <div className="card">
      <h3>Select Label</h3>
      <div className="label-grid">
        {labels.map((label, index) => (
          <button key={label} className="label-btn" onClick={() => onSubmit(label)}>
            {index + 1}. {label}
          </button>
        ))}
      </div>
    </div>
  );
}
