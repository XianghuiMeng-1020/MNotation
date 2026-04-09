import { useNavigate } from "react-router-dom";
import { useI18n } from "../lib/i18n";

const FEATURES = [
  { icon: "🏷️", key: "home.feature1" },
  { icon: "🤖", key: "home.feature2" },
  { icon: "⚡", key: "home.feature3" },
  { icon: "👥", key: "home.feature4" },
  { icon: "📊", key: "home.feature5" },
] as const;

export function HomePage() {
  const nav = useNavigate();
  const { t } = useI18n();

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      {/* Hero section */}
      <div className="hero-banner" style={{ borderRadius: "var(--radius-lg)" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏷️</div>
        <h1>MNotation</h1>
        <p style={{ maxWidth: 400, margin: "0 auto" }}>{t("home.intro")}</p>
      </div>

      {/* CTA buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          className="btn primary full-width lg"
          onClick={() => nav("/login")}
        >
          {t("home.getStarted")} →
        </button>
        <button
          className="btn full-width"
          onClick={() => nav("/welcome")}
        >
          {t("home.tryDemo")}
        </button>
      </div>

      {/* Features */}
      <div className="card" style={{ padding: "20px 20px 12px" }}>
        {FEATURES.map(({ icon, key }) => (
          <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 22, lineHeight: 1.4, flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--color-text-secondary)" }}>{t(key)}</span>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p style={{ textAlign: "center", fontSize: 13, color: "var(--color-text-muted)" }}>
        {t("home.note")}
      </p>
    </div>
  );
}
