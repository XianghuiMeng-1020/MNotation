import { useEffect } from "react";
import { useI18n } from "../lib/i18n";

type Props = {
  labels: string[];
  onSubmit: (label: string) => void;
  disabled?: boolean;
};

export function LabelingCard({ labels, onSubmit, disabled = false }: Props) {
  const { t } = useI18n();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const n = parseInt(e.key);
      if (!disabled && n >= 1 && n <= labels.length) {
        onSubmit(labels[n - 1]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [labels, onSubmit, disabled]);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h3 style={{ margin: 0 }}>{t("labeling.submit")}</h3>
        {labels.length > 0 && (
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            {t("labeling.keyboardHint", { n: Math.min(9, labels.length) })}
          </span>
        )}
      </div>
      <div className="label-grid">
        {labels.map((label, index) => (
          <button
            key={label}
            className="label-btn"
            onClick={() => !disabled && onSubmit(label)}
            disabled={disabled}
            style={{ opacity: disabled ? 0.5 : 1 }}
          >
            {index < 9 && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginRight: "0.3rem" }}>{index + 1}.</span>}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
