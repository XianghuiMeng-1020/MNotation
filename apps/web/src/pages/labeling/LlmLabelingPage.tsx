import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DataItemDisplay } from "../../components/DataItemDisplay";
import { LabelComparison } from "../../components/LabelComparison";
import { ProgressRing } from "../../components/ProgressRing";
import { api, type LlmMode } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function LlmLabelingPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const [item, setItem] = useState<any>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [mode, setMode] = useState<LlmMode>("prompt1");
  const [customPrompt, setCustomPrompt] = useState("");
  const [prediction, setPrediction] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const load = () => {
    api.nextLabelItem(projectId, "normal", "llm").then((r: any) => {
      setItem(r.item ?? null);
      setProgress(r.progress ?? { done: 0, total: 0 });
    }).catch(() => undefined);
  };

  useEffect(() => { load(); }, [projectId]);

  const run = async () => {
    if (!item || running) return;
    setRunning(true);
    try {
      const res = await api.runProjectLlm(projectId, { item_id: item.item_id, mode, custom_prompt_text: customPrompt });
      setPrediction(res);
    } finally {
      setRunning(false);
    }
  };

  const accept = async (label: string) => {
    if (!item) return;
    await api.submitLabel(projectId, { item_id: item.item_id, label, phase: "normal" });
    setPrediction(null);
    load();
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
        <Link to={`/projects/${projectId}`} style={{ fontSize: 12, color: "var(--color-text-muted)", textDecoration: "none" }}>←</Link>
      </div>

      {/* Mode selector */}
      <div className="segmented">
        {(["prompt1", "prompt2", "custom"] as LlmMode[]).map((x) => (
          <button key={x} className={`segmented-btn${mode === x ? " active" : ""}`} onClick={() => setMode(x)}>
            {x === "prompt1" ? "Prompt 1" : x === "prompt2" ? "Prompt 2" : "Custom"}
          </button>
        ))}
      </div>

      {mode === "custom" && (
        <div className="form-group" style={{ marginTop: 0 }}>
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
          <DataItemDisplay item={item} />
          <button className="btn primary full-width" onClick={run} disabled={running}>
            {running ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <>{t("llm.run")} →</>}
          </button>

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
      ) : (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <span className="spinner" />
        </div>
      )}
    </div>
  );
}
