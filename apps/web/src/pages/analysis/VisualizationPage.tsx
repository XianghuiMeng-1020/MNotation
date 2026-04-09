import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function formatMs(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function TimeCard({
  label,
  manualMs,
  llmMs,
}: {
  label: string;
  manualMs: number;
  llmMs: number;
}) {
  const { t } = useI18n();
  const savedPct =
    manualMs > 0 && llmMs > 0 ? Math.round(((manualMs - llmMs) / manualMs) * 100) : null;

  return (
    <div
      style={{
        flex: "1 1 200px",
        padding: "1rem 1.25rem",
        background: "var(--surface-raised)",
        borderRadius: "12px",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 12 }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 4 }}>
            {t("viz.manual")}
          </div>
          <div
            style={{ fontSize: "1.5rem", fontWeight: 700, color: "rgb(99,102,241)" }}
          >
            {manualMs > 0 ? formatMs(manualMs) : "—"}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{t("viz.seconds")}</div>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 4 }}>
            {t("viz.llm")}
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "rgb(16,185,129)" }}>
            {llmMs > 0 ? formatMs(llmMs) : "—"}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{t("viz.seconds")}</div>
        </div>
      </div>
      {savedPct !== null && savedPct > 0 && (
        <div
          style={{
            textAlign: "center",
            marginTop: 8,
            fontSize: "0.78rem",
            fontWeight: 700,
            color: "var(--success, #059669)",
          }}
        >
          {t("viz.fasterPercent", { percent: String(savedPct) })}
        </div>
      )}
    </div>
  );
}

type ConfPoint = {
  item_id: string;
  effective_label?: string;
  predicted_label?: string;
  confidence: number;
  text?: string;
};

export function VisualizationPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [confPoints, setConfPoints] = useState<ConfPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api
      .getVizStats(projectId)
      .then((r: any) => {
        setData(r);
        setError(null);
      })
      .catch(() => setError(t("viz.noData")))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    api
      .getVizLlmConfidence(projectId)
      .then((r: any) => setConfPoints(Array.isArray(r.points) ? r.points : []))
      .catch(() => setConfPoints([]));
  }, [projectId]);

  if (loading) {
    return (
      <div className="page">
        <div className="card skeleton" style={{ height: 200 }} />
        <div className="card skeleton" style={{ height: 160, marginTop: "1rem" }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: "center", padding: "2.5rem" }}>
          <p style={{ color: "var(--text-muted)" }}>{error ?? t("viz.noData")}</p>
          <Link
            to={`/projects/${projectId}/survey`}
            className="btn primary"
            style={{ display: "inline-block", marginTop: "1rem", textDecoration: "none" }}
          >
            {t("survey.goToSurvey")} →
          </Link>
        </div>
      </div>
    );
  }

  const { label_distribution: dist, time_comparison: time, label_diff: diff, total_items } = data;

  const allLabels = Array.from(
    new Set([
      ...Object.keys(dist?.manual ?? {}),
      ...Object.keys(dist?.llm ?? {}),
    ])
  ).filter((l) => l !== "UNKNOWN").sort();

  const manualData = allLabels.map((l) => dist?.manual?.[l] ?? 0);
  const llmData = allLabels.map((l) => dist?.llm?.[l] ?? 0);

  const chartData = {
    labels: allLabels,
    datasets: [
      {
        label: t("viz.manual"),
        data: manualData,
        backgroundColor: "rgba(99,102,241,0.7)",
        borderColor: "rgba(99,102,241,1)",
        borderWidth: 1,
        borderRadius: 6,
      },
      {
        label: t("viz.llm"),
        data: llmData,
        backgroundColor: "rgba(16,185,129,0.7)",
        borderColor: "rgba(16,185,129,1)",
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1 },
      },
    },
  };

  const diffItems = (diff ?? []).filter((d: any) => d.diff);

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <Link
          to={`/projects/${projectId}`}
          style={{ fontSize: "0.82rem", color: "var(--text-muted)", textDecoration: "none" }}
        >
          ← {t("projects.title")}
        </Link>
      </div>

      <div
        style={{
          background: "var(--accent)",
          color: "#fff",
          borderRadius: "14px",
          padding: "1.5rem 1.75rem",
          marginBottom: "1.25rem",
        }}
      >
        <h1 style={{ margin: "0 0 0.3rem", fontSize: "1.5rem" }}>{t("viz.title")}</h1>
        <p style={{ margin: 0, opacity: 0.88, fontSize: "0.9rem" }}>{t("viz.subtitle")}</p>
      </div>

      {total_items === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "var(--text-muted)" }}>{t("viz.noData")}</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>{t("viz.labelDist")}</h3>
            {allLabels.length > 0 ? (
              <Bar data={chartData} options={chartOptions} />
            ) : (
              <p style={{ color: "var(--text-muted)", textAlign: "center" }}>{t("viz.noData")}</p>
            )}
          </div>

          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>{t("viz.timeComparison")}</h3>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <TimeCard
                label={t("viz.sentenceAvg")}
                manualMs={time?.manual_avg_ms ?? 0}
                llmMs={time?.llm_avg_ms ?? 0}
              />
            </div>
          </div>

          {confPoints.length > 0 && (
            <div className="card" style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>LLM 置信度热力图</h3>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                每个色块对应一条 LLM 标注；绿色表示置信度高，红色表示置信度低（更需人工复核）。
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(12px, 1fr))",
                  gap: 3,
                  maxHeight: 160,
                  overflow: "auto",
                  marginBottom: "0.75rem",
                }}
              >
                {confPoints.map((p, hi) => {
                  const c = Math.max(0, Math.min(1, Number(p.confidence ?? 0)));
                  const hue = Math.round(120 * c);
                  return (
                    <div
                      key={`${p.item_id}-${hi}`}
                      title={`${p.item_id} · ${(c * 100).toFixed(0)}% · ${p.effective_label ?? ""}`}
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 2,
                        background: `hsl(${hue} 70% 42%)`,
                      }}
                    />
                  );
                })}
              </div>
              <table style={{ width: "100%", fontSize: "0.78rem", borderCollapse: "collapse", border: "1px solid var(--border)", borderRadius: 8 }}>
                <thead>
                  <tr style={{ background: "var(--surface-raised)", color: "var(--text-muted)" }}>
                    <th style={{ padding: "0.45rem 0.6rem", textAlign: "left" }}>条目</th>
                    <th style={{ padding: "0.45rem 0.6rem", textAlign: "left" }}>标签</th>
                    <th style={{ padding: "0.45rem 0.6rem", textAlign: "right" }}>置信度</th>
                  </tr>
                </thead>
                <tbody>
                  {confPoints.slice(0, 35).map((p, idx) => (
                    <tr key={`${p.item_id}-${idx}`}>
                      <td style={{ padding: "0.4rem 0.6rem", borderTop: "1px solid var(--border)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{p.item_id}</td>
                      <td style={{ padding: "0.4rem 0.6rem", borderTop: "1px solid var(--border)" }}>{p.effective_label ?? p.predicted_label ?? "—"}</td>
                      <td style={{ padding: "0.4rem 0.6rem", borderTop: "1px solid var(--border)", textAlign: "right" }}>
                        {(Math.max(0, Math.min(1, Number(p.confidence))) * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {diffItems.length > 0 && (
            <div className="card" style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>{t("viz.labelDiffTitle")}</h3>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                {t("viz.labelDiffHint")}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  fontSize: "0.82rem",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                {["viz.textColumn", "viz.manualLabelColumn", "viz.llmLabelColumn"].map(
                  (k, i) => (
                    <div
                      key={k}
                      style={{
                        padding: "0.5rem 0.75rem",
                        background: "var(--surface-raised)",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        borderRight: i < 2 ? "1px solid var(--border)" : undefined,
                      }}
                    >
                      {t(k)}
                    </div>
                  )
                )}
                {diffItems.slice(0, 30).map((d: any) => (
                  <div key={d.item_id} style={{ display: "contents" }}>
                    <div
                      style={{
                        padding: "0.5rem 0.75rem",
                        borderTop: "1px solid var(--border)",
                        borderRight: "1px solid var(--border)",
                        background: "rgba(251,191,36,0.1)",
                        fontSize: "0.78rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      {(d.text ?? "").slice(0, 100)}
                      {(d.text ?? "").length > 100 ? "…" : ""}
                    </div>
                    <div
                      style={{
                        padding: "0.5rem 0.75rem",
                        borderTop: "1px solid var(--border)",
                        borderRight: "1px solid var(--border)",
                        background: "rgba(251,191,36,0.1)",
                        fontWeight: 600,
                      }}
                    >
                      {d.manual_label}
                    </div>
                    <div
                      style={{
                        padding: "0.5rem 0.75rem",
                        borderTop: "1px solid var(--border)",
                        background: "rgba(251,191,36,0.1)",
                        fontWeight: 600,
                      }}
                    >
                      {d.llm_label ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginBottom: "2rem" }}>
            <Link
              to={`/projects/${projectId}/survey`}
              className="btn primary"
              style={{ padding: "0.9rem 2rem", textDecoration: "none", fontSize: "1rem" }}
            >
              {t("survey.goToSurvey")} →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
