import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function ProjectListPage() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    api.getProjects()
      .then((r: any) => setProjects(r.projects ?? []))
      .catch((e) => setError(e.message ?? t("common.error")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>{t("projects.title")}</h1>
        <Link to="/projects/new" className="btn primary">{t("projects.new")}</Link>
      </div>

      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
          {[1, 2, 3].map((i) => <div key={i} className="card skeleton" style={{ height: "160px" }} />)}
        </div>
      )}

      {error && <p style={{ color: "#ef4444" }}>{error}</p>}

      {!loading && projects.length === 0 && (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📂</div>
          <p style={{ marginBottom: "1.5rem" }}>{t("projects.empty")}</p>
          <Link to="/projects/new" className="btn primary">{t("projects.new")}</Link>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
        {projects.map((p) => {
          return (
            <div
              key={p.project_id}
              className="card"
              style={{ cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }}
              onClick={() => nav(`/projects/${p.project_id}`)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.6rem" }}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>{p.name}</h3>
                <span style={{
                  fontSize: "0.7rem",
                  background: "var(--surface-raised)",
                  borderRadius: "4px",
                  padding: "0.15rem 0.5rem",
                  color: "var(--text-muted)"
                }}>
                  {t(`projects.dataType.${p.data_type ?? "generic"}` as any)}
                </span>
              </div>

              {p.description && (
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 0.75rem", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {p.description}
                </p>
              )}

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                <span>📝 {t(`projects.codingMethod.${p.coding_method ?? "manual"}` as any)}</span>
                <span>🎯 {t(`projects.samplingMethod.${p.sampling_method ?? "random"}` as any)}</span>
                <span>📅 {new Date(p.created_at).toLocaleDateString()}</span>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }} onClick={(e) => e.stopPropagation()}>
                <Link to={`/projects/${p.project_id}/label`} className="btn primary sm">{t("projects.startLabeling")}</Link>
                <Link to={`/projects/${p.project_id}/settings`} className="btn sm">{t("projects.settings")}</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
