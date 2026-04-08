import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BarChart } from "../../components/BarChart";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function AdminDashboardPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const [overview, setOverview] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [timeData, setTimeData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      api.getStatsOverview(projectId).then((r: any) => setOverview(r)),
      api.getStatsPerMember(projectId).then((r: any) => setMembers(r.members ?? [])),
      api.getTimeAnalysis(projectId).then((r: any) => setTimeData(r.time ?? []))
    ]).finally(() => setLoading(false));
  }, [projectId]);

  const statCards = [
    { label: t("admin.totalItems"), value: overview?.total_items ?? 0, icon: "📋" },
    { label: t("admin.totalLabels"), value: overview?.total_labels ?? 0, icon: "🏷️" },
    { label: t("admin.openConflicts"), value: overview?.open_conflicts ?? 0, icon: "⚡" },
  ];

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <Link to={`/projects/${projectId}`} style={{ fontSize: "0.82rem", color: "var(--text-muted)", textDecoration: "none" }}>← Back</Link>
          <h1 style={{ margin: "0.25rem 0 0" }}>{t("admin.title")}</h1>
        </div>
        <Link to={`/projects/${projectId}/admin/config`} className="btn">{t("admin.config")}</Link>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          {[1, 2, 3].map((i) => <div key={i} className="card skeleton" style={{ height: "80px" }} />)}
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            {statCards.map(({ label, value, icon }) => (
              <div key={label} className="card" style={{ textAlign: "center", padding: "1.25rem" }}>
                <div style={{ fontSize: "1.75rem", marginBottom: "0.4rem" }}>{icon}</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{value}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Label distribution */}
          {overview?.labels?.length > 0 && (() => {
            const counts: Record<string, number> = {};
            (overview.labels as string[]).forEach((l: string, i: number) => { counts[l] = overview.values?.[i] ?? 0; });
            return <BarChart title={t("admin.labelDistribution")} counts={counts} />;
          })()}

          {/* Per member progress */}
          {members.length > 0 && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3 style={{ marginBottom: "1rem" }}>{t("admin.perMemberProgress")}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {members.map((m) => {
                  const pct = overview?.total_items > 0 ? Math.min(100, Math.round(Number(m.labeled ?? 0) * 100 / overview.total_items)) : 0;
                  return (
                    <div key={m.user_id}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                        <span>{m.user_id?.replace(/^email:/, "") ?? m.user_id}</span>
                        <span style={{ color: "var(--text-muted)" }}>{m.labeled ?? 0} labeled · {pct}%</span>
                      </div>
                      <div style={{ height: "8px", borderRadius: "4px", background: "var(--surface-raised)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: "4px", transition: "width 0.5s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time analysis */}
          {timeData.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>{t("admin.timeAnalysis")}</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Member</th>
                      <th style={thStyle}>Avg Active (ms)</th>
                      <th style={thStyle}>Avg Idle (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeData.map((row) => (
                      <tr key={row.user_id}>
                        <td style={tdStyle}>{row.user_id?.replace(/^email:/, "")}</td>
                        <td style={tdStyle}>{row.avg_active_ms ? Math.round(Number(row.avg_active_ms)).toLocaleString() : "—"}</td>
                        <td style={tdStyle}>{row.avg_idle_ms ? Math.round(Number(row.avg_idle_ms)).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  background: "var(--surface-raised)",
  textAlign: "left",
  fontWeight: 600,
  borderBottom: "1px solid var(--border-color)"
};
const tdStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid var(--border-color)"
};
