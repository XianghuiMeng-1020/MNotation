import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function ProductivityPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const [prod, setProd] = useState<any>(null);
  const [eta, setEta] = useState<any>(null);
  const [evo, setEvo] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      api.getAnalyticsProductivity(projectId),
      api.getAnalyticsEta(projectId),
      api.getAnalyticsPhaseEvolution(projectId)
    ])
      .then(([a, b, c]) => {
        setProd(a);
        setEta(b);
        setEvo(c);
      })
      .catch((e: any) => setErr(e?.message ?? t("common.error")));
  }, [projectId, t]);

  return (
    <div className="page">
      <Link to={`/projects/${projectId}`} style={{ fontSize: 13 }}>← {t("projects.backToProject")}</Link>
      <h2 style={{ marginTop: 12 }}>Productivity & ETA</h2>
      {err && <div className="error-box">{err}</div>}
      <div className="card" style={{ marginTop: 12 }}>
        <h3>ETA</h3>
        <p>Todo assignments: {eta?.todo_assignments ?? "—"}</p>
        <p>Est. hours remaining: {eta?.estimated_hours_remaining ?? "—"}</p>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3>Per user (manual)</h3>
        <pre style={{ fontSize: 12, overflow: "auto" }}>{JSON.stringify(prod?.per_user ?? [], null, 2)}</pre>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3>Labels by phase</h3>
        <pre style={{ fontSize: 12, overflow: "auto" }}>{JSON.stringify(evo?.by_phase ?? [], null, 2)}</pre>
      </div>
    </div>
  );
}
