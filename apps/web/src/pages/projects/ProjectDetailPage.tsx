import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BarChart } from "../../components/BarChart";
import { NotificationBell } from "../../components/NotificationBell";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const [project, setProject] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [irr, setIrr] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      api.getProject(projectId).then((r: any) => setProject(r.project)),
      api.getStatsOverview(projectId).then((r: any) => setOverview(r)),
      api.getLatestIrr(projectId).then((r: any) => setIrr(r)).catch(() => setIrr(null))
    ]).finally(() => setLoading(false));
  }, [projectId]);

  const pct = overview?.total_items > 0 ? Math.round(overview.total_labels / overview.total_items * 100) : 0;

  const quickActions = [
    { icon: "🏷️", label: t("projects.startLabeling"), to: `/projects/${projectId}/label`, primary: true },
    { icon: "🤖", label: t("llm.title"), to: `/projects/${projectId}/llm` },
    { icon: "📊", label: t("projects.viewIrr"), to: `/projects/${projectId}/irr` },
    { icon: "⚡", label: t("projects.resolveConflicts"), to: `/projects/${projectId}/conflicts` },
    { icon: "📤", label: t("projects.exportData"), to: `/projects/${projectId}/export` },
    { icon: "⚙️", label: t("projects.settings"), to: `/projects/${projectId}/settings` },
    { icon: "📈", label: t("projects.adminDashboard"), to: `/projects/${projectId}/admin` },
  ];

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <Link to="/projects" style={{ fontSize: "0.82rem", color: "var(--text-muted)", textDecoration: "none" }}>← {t("projects.title")}</Link>
          <h1 style={{ margin: "0.25rem 0 0" }}>{project?.name ?? "…"}</h1>
          {project?.description && (
            <p style={{ margin: "0.3rem 0 0", color: "var(--text-muted)", fontSize: "0.88rem" }}>{project.description}</p>
          )}
        </div>
        <NotificationBell projectId={projectId} />
      </div>

      {loading ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          {[1, 2].map((i) => <div key={i} className="card skeleton" style={{ height: "100px" }} />)}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Progress */}
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>{t("projects.progress")}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                {[
                  { label: t("admin.totalItems"), value: overview?.total_items ?? 0 },
                  { label: t("admin.totalLabels"), value: overview?.total_labels ?? 0 },
                  { label: t("admin.openConflicts"), value: overview?.open_conflicts ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: "1.4rem" }}>{value}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ height: "8px", borderRadius: "4px", background: "var(--surface-raised)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: "4px", transition: "width 0.6s" }} />
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "right", marginTop: "0.3rem" }}>{pct}%</div>
            </div>

            {/* IRR summary */}
            {irr && (
              <div className="card">
                <h3 style={{ marginBottom: "0.75rem" }}>{t("projects.irr")}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  {[
                    { label: t("irr.fleissKappa"), value: irr.fleiss_kappa != null ? Number(irr.fleiss_kappa).toFixed(3) : "—" },
                    { label: t("irr.percentAgreement"), value: irr.percent_agreement != null ? `${(Number(irr.percent_agreement) * 100).toFixed(1)}%` : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ textAlign: "center", padding: "0.6rem", background: "var(--surface-raised)", borderRadius: "8px" }}>
                      <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{value}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{label}</div>
                    </div>
                  ))}
                </div>
                {irr.calculated_at && (
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "right", marginTop: "0.4rem" }}>
                    {new Date(irr.calculated_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {/* Label distribution chart */}
            {overview?.labels?.length > 0 && (
              <div className="card">
                <h3 style={{ marginBottom: "1rem" }}>{t("admin.labelDistribution")}</h3>
                <BarChart labels={overview.labels} values={overview.values} />
              </div>
            )}
          </div>

          {/* Right column: quick actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h3 style={{ margin: "0 0 0.5rem" }}>Quick Actions</h3>
            {quickActions.map(({ icon, label, to, primary }) => (
              <Link
                key={to}
                to={to}
                className={`btn ${primary ? "primary" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", justifyContent: "flex-start", textDecoration: "none" }}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
