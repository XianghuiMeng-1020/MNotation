import { Link, useParams } from "react-router-dom";
import { useI18n } from "../../lib/i18n";

export function WelcomePage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();

  const steps = [
    { num: "1", key: "welcome.step1", icon: "🏷️" },
    { num: "2", key: "welcome.step2", icon: "🤖" },
    { num: "3", key: "welcome.step3", icon: "⚡" },
    { num: "4", key: "welcome.step4", icon: "📊" },
  ];

  return (
    <div
      className="page"
      style={{ justifyContent: "center", minHeight: "100dvh", alignItems: "center" }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          margin: "0 auto",
          padding: "2.5rem 2rem",
          background: "var(--surface)",
          borderRadius: "20px",
          boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🏷️</div>
          <h1 style={{ fontSize: "1.7rem", margin: "0 0 0.5rem" }}>{t("welcome.title")}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, margin: 0 }}>
            {t("welcome.subtitle")}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.75rem" }}>
          {steps.map((s) => (
            <div
              key={s.num}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.75rem 1rem",
                background: "var(--surface-raised)",
                borderRadius: "10px",
              }}
            >
              <span style={{ fontSize: "1.25rem", flexShrink: 0, lineHeight: 1 }}>{s.icon}</span>
              <div>
                <span
                  style={{
                    display: "inline-block",
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    color: "#fff",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    textAlign: "center",
                    lineHeight: "20px",
                    marginRight: 8,
                    flexShrink: 0,
                  }}
                >
                  {s.num}
                </span>
                <span style={{ fontSize: "0.9rem", color: "var(--text)" }}>{t(s.key)}</span>
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            fontSize: "0.82rem",
            color: "var(--text-muted)",
            textAlign: "center",
            marginBottom: "1.5rem",
            lineHeight: 1.6,
          }}
        >
          {t("welcome.note")}
        </p>

        <Link
          to={`/projects/${projectId}/label`}
          className="btn primary"
          style={{
            display: "block",
            textAlign: "center",
            padding: "0.9rem",
            fontSize: "1rem",
            fontWeight: 600,
            textDecoration: "none",
            borderRadius: "10px",
          }}
        >
          {t("welcome.letsGo")} →
        </Link>
      </div>
    </div>
  );
}
