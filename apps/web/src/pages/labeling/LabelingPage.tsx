import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DataItemDisplay } from "../../components/DataItemDisplay";
import { LabelingCard } from "../../components/LabelingCard";
import { LabelComparison } from "../../components/LabelComparison";
import { ProgressRing } from "../../components/ProgressRing";
import { ChatPanel } from "../../components/ChatPanel";
import { NotificationBell } from "../../components/NotificationBell";
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
        api.getCodingScheme(projectId) as any
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
        attempt: tracker.finalize()
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
      <div className="page" style={{ textAlign: "center", paddingTop: "4rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
        <h2>{t("labeling.allDone")}</h2>
        <p style={{ color: "var(--text-muted)" }}>{t("labeling.progress")}: {progress.done}/{progress.total}</p>
        <Link to={`/projects/${projectId}`} className="btn primary" style={{ marginTop: "1rem", display: "inline-block" }}>
          ← Back to Project
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Top bar */}
      <div className="progress-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link to={`/projects/${projectId}`} style={{ fontSize: "0.82rem", color: "var(--text-muted)", textDecoration: "none" }}>← Back</Link>
          <ProgressRing done={progress.done} total={progress.total} />
          <div>
            <strong style={{ fontSize: "0.95rem" }}>{t("labeling.title")}</strong>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {t("labeling.phase")}: {t(`labeling.phase.${phase}` as any)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {lastItem && (
            <button className="btn sm" onClick={undo} disabled={undoing}>
              {undoing ? "…" : t("labeling.undo")}
            </button>
          )}
          <NotificationBell projectId={projectId} />
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1rem", alignItems: "start" }}>
        {/* Left: item + labeling */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {item ? (
            <>
              <DataItemDisplay item={item} />
              <LabelingCard
                labels={labels}
                onSubmit={submit}
                disabled={submitting}
              />
              <LabelComparison
                manualLabel={item?.my_label}
                llmLabel={item?.llm_label}
              />
            </>
          ) : (
            <div className="card skeleton" style={{ height: "200px" }} />
          )}
        </div>

        {/* Right: chat */}
        <div style={{ position: "sticky", top: "1rem" }}>
          <ChatPanel
            projectId={projectId}
            itemId={item?.item_id}
            messages={[]}
          />
        </div>
      </div>
    </div>
  );
}
