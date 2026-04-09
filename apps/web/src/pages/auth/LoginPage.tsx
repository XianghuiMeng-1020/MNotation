import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function LoginPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      await api.login(email.trim(), name.trim() || undefined);
      nav("/projects");
    } catch (e: any) {
      setError(e?.message ?? t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ justifyContent: "center", minHeight: "100dvh" }}>
      <div className="welcome-card">
        <div className="welcome-icon">🏷️</div>
        <h1 className="welcome-title">MNotation</h1>
        <p className="welcome-subtitle">
          {t("auth.subtitle")}
        </p>

        <div style={{ textAlign: "left", marginTop: 24 }}>
          <div className="form-group">
            <label htmlFor="login-email">{t("auth.email")}</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-display-name">{t("auth.displayName")}</label>
            <input
              id="login-display-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("auth.displayNamePlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        </div>

        {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}

        <button
          className="btn primary full-width lg"
          style={{ marginTop: 16 }}
          onClick={submit}
          disabled={!email.trim() || loading}
        >
          {loading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <>{t("auth.login")} →</>}
        </button>
      </div>
    </div>
  );
}
