import { useMemo, useRef } from "react";
import { useI18n } from "../lib/i18n";

let ringIdCounter = 0;

export function ProgressRing({ done, total }: { done: number; total: number }) {
  const { t } = useI18n();
  const startAtRef = useRef<number>(Date.now());
  const r = 18;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  const offset = circ * (1 - pct);
  const gradientId = `progressGradient_${ringIdCounter++}`;
  const pctText = `${Math.round(pct * 100)}%`;
  const etaText = useMemo(() => {
    if (total <= 0 || done <= 0 || done >= total) return "";
    const elapsed = Date.now() - startAtRef.current;
    const avgPerItem = elapsed / done;
    const left = total - done;
    const etaMs = avgPerItem * left;
    if (etaMs < 60_000) return "~1m";
    return `~${Math.max(1, Math.round(etaMs / 60_000))}m`;
  }, [done, total]);
  return (
    <div
      className="progress-ring"
      role="progressbar"
      aria-valuenow={done}
      aria-valuemax={Math.max(total, 1)}
      aria-label={`${t("labeling.progress")} ${done}/${total} (${pctText})`}
    >
      <svg width="44" height="44" viewBox="0 0 44 44">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle className="ring-bg" cx="22" cy="22" r={r} />
        <circle className="ring-fill" cx="22" cy="22" r={r} strokeDasharray={circ} strokeDashoffset={offset} stroke={`url(#${gradientId})`} />
      </svg>
      <div className="ring-text">
        <div>{done}/{total}</div>
        <div style={{ fontSize: 10, opacity: 0.8 }}>{pctText}{etaText ? ` · ${etaText}` : ""}</div>
      </div>
    </div>
  );
}
