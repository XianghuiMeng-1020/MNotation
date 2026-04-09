import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DataItemDisplay } from "../../components/DataItemDisplay";
import { LabelComparison } from "../../components/LabelComparison";
import { ProgressRing } from "../../components/ProgressRing";
import { api, type LlmMode } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useAttemptTracker } from "../../hooks/useAttemptTracker";

export function LlmLabelingPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const [item, setItem] = useState<any>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [mode, setMode] = useState<LlmMode>("prompt1");
  const [customPrompt, setCustomPrompt] = useState("");
  const [prediction, setPrediction] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customQuota, setCustomQuota] = useState<{ count: number; max: number } | null>(null);
  const [schemeLabels, setSchemeLabels] = useState<string[]>([]);
  const tracker = useAttemptTracker(item?.item_id ?? "none");

  useEffect(() => {
    if (!projectId) return;
    api.getCodingScheme(projectId)
      .then((r: any) => setSchemeLabels((r?.labels ?? []).map((x: any) => String(x.code))))
      .catch(() => setSchemeLabels([]));
  }, [projectId]);

  const load = () => {
    setLoading(true);
    setError("");
    api.nextLabelItem(projectId, "normal", "llm").then((r: any) => {
      setItem(r.item ?? null);
      setProgress(r.progress ?? { done: 0, total: 0 });
    }).catch((e: any) => setError(e?.message ?? t("common.error")))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId]);

  useEffect(() => {
    if (!projectId || !item?.item_id || mode !== "custom") {
      setCustomQuota(null);
      return;
    }
    api.getProjectCustomCount(projectId, item.item_id)
      .then((r: any) => setCustomQuota({ count: Number(r.count ?? 0), max: Number(r.max ?? 5) }))
      .catch(() => setCustomQuota(null));
  }, [projectId, item?.item_id, mode]);

  const run = async () => {
    if (!item || running) return;
    setRunning(true);
    setError("");
    try {
      const res = await api.runProjectLlm(projectId, { item_id: item.item_id, mode, custom_prompt_text: customPrompt });
      setPrediction(res);
    } catch (e: any) {
      setError(e?.message ?? t("common.error"));
    } finally {
      setRunning(false);
    }
  };

  const accept = async (label: string) => {
    if (!item) return;
    try {
      await api.submitLabel(projectId, { item_id: item.item_id, label, phase: "normal", attempt: tracker.finalize() });
      setPrediction(null);
      load();
    } catch (e: any) {
      setError(e?.message ?? t("common.error"));
    }
  };

  return (
    <div className="page">
      {/* Sticky header */}
      <div className="progress-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ProgressRing done={progress.done} total={progress.total} />
          <div className="progress-info">
            <div className="progress-title">{t("llm.title")}</div>
            <div className="progress-subtitle">{progress.done}/{progress.total}</div>
          </div>
        </div>
        <Link
          to={`/projects/${projectId}`}
          aria-label={t("projects.backToProject")}
          style={{ fontSize: 12, color: "var(--color-text-muted)", textDecoration: "none" }}
        >
          ←
        </Link>
      </div>

      {/* Mode selector */}
      <div className="segmented">
        {(["prompt1", "prompt2", "custom"] as LlmMode[]).map((x) => (
          <button key={x} className={`segmented-btn${mode === x ? " active" : ""}`} onClick={() => setMode(x)}>
            {x === "prompt1" ? t("llm.mode.prompt1") : x === "prompt2" ? t("llm.mode.prompt2") : t("llm.mode.custom")}
          </button>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}

      {mode === "custom" && (
        <div className="form-group" style={{ marginTop: 0 }}>
          {customQuota && (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>
              {t("llm.customRemaining")}: {Math.max(0, customQuota.max - customQuota.count)}/{customQuota.max}
            </div>
          )}
          <textarea
            rows={3}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={t("llm.customPlaceholder")}
          />
        </div>
      )}

      {item ? (
        <>
          <DataItemDisplay item={item} projectId={projectId} labels={schemeLabels} />
          <button className="btn primary full-width" onClick={run} disabled={running}>
            {running ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <>{t("llm.run")} →</>}
          </button>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
            {t("llm.promptSource")}: {mode}
          </div>

          {prediction && (
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                {t("llm.prediction")}
              </div>
              <div className="predicted-badge">{prediction.predicted_label}</div>
              {prediction.confidence != null && (
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                  {t("llm.confidence")}: {Math.round(prediction.confidence * 100)}%
                </div>
              )}
              {prediction.reasoning && (
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 10, textAlign: "left" }}>
                  {prediction.reasoning}
                </p>
              )}
              <div className="btn-group" style={{ marginTop: 16, justifyContent: "center" }}>
                <button className="btn success" onClick={() => accept(prediction.predicted_label)}>
                  {t("llm.accept")} ✓
                </button>
                <button className="btn" onClick={() => setPrediction(null)}>
                  {t("llm.reject")}
                </button>
              </div>
            </div>
          )}

          <LabelComparison manualLabel={item?.my_label} llmLabel={prediction?.predicted_label ?? item?.llm_label} />
        </>
      ) : loading ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <span className="spinner" />
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
          {t("labeling.allDone")}
        </div>
      )}
    </div>
  );
}
