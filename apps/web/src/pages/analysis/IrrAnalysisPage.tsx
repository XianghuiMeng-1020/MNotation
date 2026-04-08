import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { IrrDashboard, type IrrSnapshot } from "../../components/IrrDashboard";
import { useIrr } from "../../hooks/useIrr";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function IrrAnalysisPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const { irr, history, calculating, calculate } = useIrr(projectId);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [gettingSuggestion, setGettingSuggestion] = useState(false);

  const getAiSuggestion = async () => {
    setGettingSuggestion(true);
    try {
      const res = await api.aiSuggestIrr(projectId) as any;
      setAiSuggestion(res.suggestion ?? "");
    } finally {
      setGettingSuggestion(false);
    }
  };

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <Link to={`/projects/${projectId}`} style={{ fontSize: "0.82rem", color: "var(--text-muted)", textDecoration: "none" }}>← Back</Link>
          <h1 style={{ margin: "0.25rem 0 0" }}>{t("irr.title")}</h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn primary"
            onClick={calculate}
            disabled={calculating}
          >
            {calculating ? t("irr.calculating") : t("irr.calculate")}
          </button>
          <button
            className="btn"
            onClick={getAiSuggestion}
            disabled={gettingSuggestion}
          >
            {gettingSuggestion ? t("common.loading") : t("irr.aiSuggestRun")}
          </button>
        </div>
      </div>

      <IrrDashboard irr={irr} history={history} />

      {/* AI Suggestion panel */}
      {aiSuggestion && (
        <div className="card" style={{ marginTop: "1rem", borderLeft: "4px solid var(--accent)" }}>
          <h3 style={{ marginBottom: "0.75rem" }}>🤖 {t("irr.aiSuggest")}</h3>
          <p style={{ lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{aiSuggestion}</p>
        </div>
      )}
    </div>
  );
}
