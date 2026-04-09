import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChatPanel } from "../../components/ChatPanel";
import { NotificationBell } from "../../components/NotificationBell";
import { PresenceBar } from "../../components/PresenceBar";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const [project, setProject] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [irr, setIrr] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    Promise.all([
      api.getProject(projectId).then((r: any) => setProject(r.project)),
      api.getStatsOverview(projectId).then((r: any) => setOverview(r)),
      api.getLatestIrr(projectId).then((r: any) => setIrr(r)).catch(() => setIrr(null)),
      api.getMessages(projectId).then((r: any) => setMessages(r.messages ?? [])),
    ]).catch((e: any) => setError(e?.message ?? t("common.error")))
      .finally(() => setLoading(false));
  }, [projectId, t]);

  const pct = overview?.total_items > 0 ? Math.round((overview.total_labels / overview.total_items) * 100) : 0;

  const quickActions = [
    { icon: "👋", label: t("projects.welcome"), to: `/projects/${projectId}/welcome` },
    { icon: "🏷️", label: t("projects.startLabeling"), to: `/projects/${projectId}/label`, primary: true },
    { icon: "🤖", label: t("llm.title"), to: `/projects/${projectId}/llm` },
    { icon: "📊", label: t("projects.viewIrr"), to: `/projects/${projectId}/irr` },
    { icon: "⚡", label: t("projects.resolveConflicts"), to: `/projects/${projectId}/conflicts` },
    { icon: "📈", label: t("projects.visualization"), to: `/projects/${projectId}/visualization` },
    { icon: "📝", label: t("projects.survey"), to: `/projects/${projectId}/survey` },
    { icon: "📤", label: t("projects.exportData"), to: `/projects/${projectId}/export` },
    { icon: "📋", label: "Data items", to: `/projects/${projectId}/data-items` },
    { icon: "⏱️", label: "Productivity", to: `/projects/${projectId}/productivity` },
    { icon: "⚙️", label: t("projects.settings"), to: `/projects/${projectId}/settings` },
    { icon: "🗂️", label: t("projects.adminDashboard"), to: `/projects/${projectId}/admin` },
  ];

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      {/* Back link + title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <Link to="/projects" style={{ fontSize: 13, color: "var(--color-text-muted)", textDecoration: "none" }}>
            ← {t("projects.backToProject")}
          </Link>
          <h1 style={{ margin: "4px 0 0", fontSize: 22, background: "var(--grad-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {project?.name ?? "…"}
          </h1>
          {project?.description && (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>{project.description}</p>
          )}
        </div>
        <NotificationBell projectId={projectId} />
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((i) => <div key={i} className="card skeleton" style={{ height: 80 }} />)}
        </div>
      ) : (
        <>
          {error && <div className="error-box">{error}</div>}
          <div style={{ marginBottom: 12 }}>
            <PresenceBar projectId={projectId} />
          </div>
          {/* Progress card */}
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>{t("projects.progress")}</h3>
            <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 12 }}>
              {[
                { label: t("admin.totalItems"), value: overview?.total_items ?? 0 },
                { label: t("admin.totalLabels"), value: overview?.total_labels ?? 0 },
                { label: t("admin.openConflicts"), value: overview?.open_conflicts ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 22 }}>{value}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{label}</div>
                </div>
              ))}
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "right", marginTop: 4 }}>{pct}%</div>
          </div>

          {/* IRR card */}
          {irr && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>{t("projects.irr")}</h3>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: t("irr.fleissKappa"), value: irr.fleiss_kappa != null ? Number(irr.fleiss_kappa).toFixed(3) : "—" },
                  { label: t("irr.percentAgreement"), value: irr.percent_agreement != null ? `${(Number(irr.percent_agreement) * 100).toFixed(1)}%` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ flex: 1, textAlign: "center", padding: 12, background: "var(--color-surface-raised)", borderRadius: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{value}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>{t("projects.quickActions")}</h3>
          <div className="label-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {quickActions.map(({ icon, label, to, primary }) => (
              <Link
                key={to}
                to={to}
                className={`label-btn${primary ? " active" : ""}`}
                style={{ textDecoration: "none", fontSize: 13, gap: 6 }}
                aria-label={label}
              >
                <span aria-hidden="true">{icon}</span> {label}
              </Link>
            ))}
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <button className="btn sm" onClick={() => setChatOpen((x) => !x)}>
              {chatOpen ? t("common.hide") : t("common.show")} Chat
            </button>
            {chatOpen && (
              <div style={{ marginTop: 10 }}>
                <ChatPanel
                  projectId={projectId}
                  messages={messages}
                  onSend={async (content) => {
                    await api.postMessage(projectId, { content, message_type: "chat" });
                    const res = await api.getMessages(projectId) as any;
                    setMessages(res.messages ?? []);
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
