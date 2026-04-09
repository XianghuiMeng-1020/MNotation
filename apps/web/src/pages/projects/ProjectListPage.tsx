import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function ProjectListPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const loadProjects = () => {
    setLoading(true);
    api.getProjects()
      .then((r: any) => setProjects(r.projects ?? []))
      .catch((e: any) => {
        const message = String(e?.message ?? "");
        if (message.includes("unauthorized")) {
          nav("/login");
          return;
        }
        setError(message || t("common.error"));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProjects();
  }, [nav, t]);

  const filteredProjects = projects.filter((p: any) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return String(p?.name ?? "").toLowerCase().includes(q) || String(p?.description ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="hero-banner">
        <h1>{t("projects.title")}</h1>
        <p>MNotation — {t("projects.subtitle")}</p>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Link to="/projects/new" className="btn primary" style={{ textDecoration: "none" }}>
          + {t("common.create")}
        </Link>
      </div>
      <div className="card" style={{ padding: 12 }}>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("projects.searchPlaceholder")}
          aria-label={t("projects.searchPlaceholder")}
        />
      </div>

      {error && (
        <div className="error-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>{error}</span>
          <button className="btn sm" onClick={loadProjects}>{t("common.retry")}</button>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="card skeleton" style={{ height: 90 }} />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
          <p style={{ marginBottom: 16 }}>{query.trim() ? t("projects.noSearchResults") : t("projects.empty")}</p>
          <Link to="/projects/new" className="btn primary lg" style={{ textDecoration: "none" }}>
            {t("projects.createFirst")}
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredProjects.map((p: any) => (
            <Link
              key={p.project_id}
              to={`/projects/${p.project_id}`}
              className="project-card"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{p.name}</h3>
                  {p.description && (
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
                      {p.description}
                    </p>
                  )}
                </div>
                <span className="badge purple" style={{ flexShrink: 0 }}>
                  {p.data_type ?? "text"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: "var(--color-text-muted)" }}>
                <span>{t("projects.members")}: {p.member_count ?? "—"}</span>
                <span>{t("projects.items")}: {p.item_count ?? "—"}</span>
                <span>{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
