import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";
import { useI18n } from "../lib/i18n";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export type IrrSnapshot = {
  snapshot_id?: string;
  calculated_at?: string;
  total_items?: number;
  overlapping_items?: number;
  cohens_kappa?: number | null;
  fleiss_kappa?: number | null;
  krippendorffs_alpha?: number | null;
  percent_agreement?: number | null;
  per_category_json?: string;
  rater_pair_json?: string;
};

type Props = {
  irr: IrrSnapshot | null;
  history?: IrrSnapshot[];
};

function kappaLabel(v: number | null | undefined, t: (k: string) => string): string {
  if (v == null) return "—";
  const n = Number(v);
  if (n < 0.2) return `${n.toFixed(3)} (${t("irr.poor")})`;
  if (n < 0.4) return `${n.toFixed(3)} (${t("irr.fair")})`;
  if (n < 0.6) return `${n.toFixed(3)} (${t("irr.moderate")})`;
  if (n < 0.8) return `${n.toFixed(3)} (${t("irr.substantial")})`;
  return `${n.toFixed(3)} (${t("irr.excellent")})`;
}

function kappaColor(v: number | null | undefined): string {
  if (v == null) return "var(--text-muted)";
  const n = Number(v);
  if (n < 0.2) return "#ef4444";
  if (n < 0.4) return "#f97316";
  if (n < 0.6) return "#eab308";
  if (n < 0.8) return "#22c55e";
  return "#16a34a";
}

export function IrrDashboard({ irr, history = [] }: Props) {
  const { t } = useI18n();

  if (!irr || (!irr.fleiss_kappa && !irr.percent_agreement)) {
    return (
      <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📊</div>
        <p>{t("irr.noData")}</p>
      </div>
    );
  }

  const pairwise: Record<string, number> = (() => {
    try { return JSON.parse(irr.rater_pair_json ?? "{}"); } catch { return {}; }
  })();

  const trendLabels = [...history].reverse().map((s) =>
    s.calculated_at ? new Date(s.calculated_at).toLocaleDateString() : ""
  );
  const trendFleiss = [...history].reverse().map((s) => s.fleiss_kappa ?? null);
  const trendPercent = [...history].reverse().map((s) =>
    s.percent_agreement != null ? Number(s.percent_agreement) : null
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
        {[
          { label: t("irr.percentAgreement"), value: irr.percent_agreement != null ? `${(Number(irr.percent_agreement) * 100).toFixed(1)}%` : "—", raw: irr.percent_agreement },
          { label: t("irr.fleissKappa"), value: kappaLabel(irr.fleiss_kappa, t), raw: irr.fleiss_kappa },
          { label: t("irr.cohensKappa"), value: kappaLabel(irr.cohens_kappa, t), raw: irr.cohens_kappa },
          { label: t("irr.krippendorffsAlpha"), value: kappaLabel(irr.krippendorffs_alpha, t), raw: irr.krippendorffs_alpha },
          { label: t("irr.overlappingItems"), value: String(irr.overlapping_items ?? 0), raw: null },
          { label: t("irr.totalItems"), value: String(irr.total_items ?? 0), raw: null },
        ].map(({ label, value, raw }) => (
          <div key={label} className="card" style={{ padding: "1rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", color: kappaColor(raw) }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      {history.length > 1 && (
        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>{t("irr.trend")}</h3>
          <Line
            data={{
              labels: trendLabels,
              datasets: [
                {
                  label: t("irr.fleissKappa"),
                  data: trendFleiss,
                  borderColor: "#6366f1",
                  backgroundColor: "rgba(99,102,241,0.1)",
                  tension: 0.3,
                  spanGaps: true,
                },
                {
                  label: t("irr.percentAgreement"),
                  data: trendPercent,
                  borderColor: "#22c55e",
                  backgroundColor: "rgba(34,197,94,0.1)",
                  tension: 0.3,
                  spanGaps: true,
                }
              ]
            }}
            options={{
              responsive: true,
              scales: { y: { min: 0, max: 1 } },
              plugins: { legend: { position: "top" } }
            }}
          />
        </div>
      )}

      {/* Pairwise kappa */}
      {Object.keys(pairwise).length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: "1rem" }}>{t("irr.pairwise")}</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("irr.coder1")}</th>
                  <th style={thStyle}>{t("irr.coder2")}</th>
                  <th style={thStyle}>Kappa</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(pairwise).map(([pair, kappa]) => {
                  const [c1, c2] = pair.split("::");
                  return (
                    <tr key={pair}>
                      <td style={tdStyle}>{c1}</td>
                      <td style={tdStyle}>{c2}</td>
                      <td style={{ ...tdStyle, color: kappaColor(kappa), fontWeight: 600 }}>{Number(kappa).toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {irr.calculated_at && (
        <p style={{ textAlign: "right", fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {t("irr.lastCalculated")}: {new Date(irr.calculated_at).toLocaleString()}
        </p>
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
