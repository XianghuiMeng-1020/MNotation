import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DataItemDisplay } from "../../components/DataItemDisplay";
import { LabelingCard } from "../../components/LabelingCard";
import { LabelComparison } from "../../components/LabelComparison";
import { ProgressRing } from "../../components/ProgressRing";
import { api } from "../../lib/api";
import { useAttemptTracker } from "../../hooks/useAttemptTracker";
import { useI18n } from "../../lib/i18n";

type Phase = "normal" | "active" | "conflict_resolution";
type Task = "manual" | "llm";

export function LabelingPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const [phase] = useState<Phase>("normal");
  const [task] = useState<Task>("manual");
  const [item, setItem] = useState<any>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastItem, setLastItem] = useState<any>(null);
  const [undoing, setUndoing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const tracker = useAttemptTracker(item?.item_id ?? "none");

  const load = async () => {
    if (!projectId) return;
    try {
      const [nextRes, schemeRes] = await Promise.all([
        api.nextLabelItem(projectId, phase, task) as any,
        api.getCodingScheme(projectId) as any,
      ]);
      const nextItem = nextRes.item ?? null;
      setItem(nextItem);
      setProgress(nextRes.progress ?? { done: 0, total: 0 });
      const schemeCodes: string[] = (schemeRes?.labels ?? []).map((x: any) => x.code).slice(0, 12);
      setLabels(schemeCodes.length > 0 ? schemeCodes : ["CODE_A", "CODE_B", "CODE_C", "UNKNOWN"]);
      if (!nextItem) setDone(true);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, [projectId, phase, task]);

  const submit = async (label: string) => {
    if (!projectId || !item || submitting) return;
    setSubmitting(true);
    setLastItem(item);
    try {
      await api.submitLabel(projectId, {
        item_id: item.item_id,
        label,
        phase,
        attempt: tracker.finalize(),
      });
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const undo = async () => {
    if (!projectId || !lastItem || undoing) return;
    setUndoing(true);
    try {
      await api.undoLabel(projectId, { item_id: lastItem.item_id, phase });
      setLastItem(null);
      setDone(false);
      await load();
    } finally {
      setUndoing(false);
    }
  };

  if (done && !item) {
    return (
      <div className="page" style={{ justifyContent: "center", minHeight: "100dvh" }}>
        <div className="welcome-card">
          <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
          <h2>{t("labeling.allDone")}</h2>
          <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
            {t("labeling.progress")}: {progress.done}/{progress.total}
          </p>
          <Link
            to={`/projects/${projectId}/visualization`}
            className="btn primary full-width lg"
            style={{ marginTop: 20, textDecoration: "none" }}
          >
            {t("projects.visualization")} →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Sticky progress header — V1 pattern */}
      <div className="progress-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ProgressRing done={progress.done} total={progress.total} />
          <div className="progress-info">
            <div className="progress-title">{t("labeling.title")}</div>
            <div className="progress-subtitle">
              {t("labeling.phase")}: {t(`labeling.phase.${phase}` as any)} · {progress.done}/{progress.total}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {lastItem && (
            <button className="btn" style={{ padding: "6px 14px", fontSize: 13, minHeight: 36 }} onClick={undo} disabled={undoing}>
              {undoing ? "…" : t("labeling.undo")}
            </button>
          )}
          <Link to={`/projects/${projectId}`} style={{ fontSize: 12, color: "var(--color-text-muted)", textDecoration: "none" }}>←</Link>
        </div>
      </div>

      {/* Undo banner */}
      {lastItem && (
        <div className="undo-banner">
          <span className="undo-text">
            <span className="undo-label">{lastItem.my_label ?? "labeled"}</span>
            {" — "}
            <span className="undo-excerpt">{(lastItem.content_text ?? "").slice(0, 60)}…</span>
          </span>
        </div>
      )}

      {item ? (
        <>
          <DataItemDisplay item={item} />
          <LabelingCard labels={labels} onSubmit={submit} disabled={submitting} />
          <LabelComparison manualLabel={item?.my_label} llmLabel={item?.llm_label} />
        </>
      ) : (
        <div className="card skeleton" style={{ height: 200 }} />
      )}
    </div>
  );
}
