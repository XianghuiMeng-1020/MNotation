import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConflictPanel, type Conflict } from "../../components/ConflictPanel";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function ConflictResolutionPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [detecting, setDetecting] = useState(false);

  const load = () =>
    api.getConflicts(projectId)
      .then((r: any) => setConflicts(r.conflicts ?? []))
      .catch(() => undefined);

  useEffect(() => { load(); }, [projectId]);

  const detect = async () => {
    setDetecting(true);
    try {
      await api.detectConflicts(projectId);
      await load();
    } finally {
      setDetecting(false);
    }
  };

  const open = conflicts.filter((c) => c.status === "open").length;
  const resolved = conflicts.filter((c) => c.status === "resolved").length;

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <Link to={`/projects/${projectId}`} style={{ fontSize: "0.82rem", color: "var(--text-muted)", textDecoration: "none" }}>← Back</Link>
          <h1 style={{ margin: "0.25rem 0 0" }}>{t("conflicts.title")}</h1>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.3rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            <span>🔴 {open} open</span>
            <span>✅ {resolved} resolved</span>
          </div>
        </div>
        <button className="btn primary" onClick={detect} disabled={detecting}>
          {detecting ? t("common.loading") : t("conflicts.detect")}
        </button>
      </div>

      <ConflictPanel conflicts={conflicts} projectId={projectId} onUpdate={load} />
    </div>
  );
}
