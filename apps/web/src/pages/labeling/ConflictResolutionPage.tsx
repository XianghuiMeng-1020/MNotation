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
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

  const load = () =>
    api.getConflicts(projectId)
      .then((r: any) => setConflicts(r.conflicts ?? []))
      .catch((e: any) => setError(e?.message ?? t("common.error")));

  useEffect(() => { load(); }, [projectId]);

  const detect = async () => {
    setDetecting(true);
    setError("");
    try {
      await api.detectConflicts(projectId);
      await load();
    } catch (e: any) {
      setError(e?.message ?? t("common.error"));
    } finally {
      setDetecting(false);
    }
  };

  const open = conflicts.filter((c) => c.status === "open").length;
  const resolved = conflicts.filter((c) => c.status === "resolved").length;
  const filtered = conflicts
    .filter((c) => (statusFilter === "all" ? true : c.status === statusFilter))
    .sort((a, b) => {
      const ta = new Date(a.detected_at ?? 0).getTime();
      const tb = new Date(b.detected_at ?? 0).getTime();
      return sortBy === "newest" ? tb - ta : ta - tb;
    });

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <Link
            to={`/projects/${projectId}`}
            aria-label={t("projects.backToProject")}
            style={{ fontSize: "0.82rem", color: "var(--text-muted)", textDecoration: "none" }}
          >
            ← {t("projects.backToProject")}
          </Link>
          <h1 style={{ margin: "0.25rem 0 0" }}>{t("conflicts.title")}</h1>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.3rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            <span aria-label={`open conflicts ${open}`}>Open: {open}</span>
            <span aria-label={`resolved conflicts ${resolved}`}>Resolved: {resolved}</span>
          </div>
        </div>
        <button className="btn primary" onClick={detect} disabled={detecting}>
          {detecting ? t("common.loading") : t("conflicts.detect")}
        </button>
      </div>
      {error && <div className="error-box">{error}</div>}
      {detecting && (
        <div className="card" style={{ fontSize: "0.86rem", color: "var(--text-muted)" }}>
          {t("conflicts.detectingHint")}
        </div>
      )}

      <div className="card" style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Filter:</span>
        {(["all", "open", "resolved"] as const).map((s) => (
          <button key={s} className={`btn sm ${statusFilter === s ? "primary" : ""}`} onClick={() => setStatusFilter(s)}>
            {s}
          </button>
        ))}
        <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: 8 }}>Sort:</span>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "newest" | "oldest")}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>

      <ConflictPanel conflicts={filtered} projectId={projectId} onUpdate={load} />
    </div>
  );
}
