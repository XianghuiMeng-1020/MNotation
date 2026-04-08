import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type LikertValue = 1 | 2 | 3 | 4 | 5 | null;
const LIKERT_OPTIONS = [1, 2, 3, 4, 5] as const;

const LIKERT_SECTIONS = [
  { titleKey: "survey.sectionA", questions: ["survey.q1", "survey.q2", "survey.q4"] },
  { titleKey: "survey.sectionB", questions: ["survey.q7", "survey.q10"] },
] as const;

const ALL_LIKERT = LIKERT_SECTIONS.flatMap((s) => s.questions);
const MC_OPTIONS = ["survey.mc_a", "survey.mc_b", "survey.mc_c", "survey.mc_d"] as const;

export function SurveyPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();

  const [likert, setLikert] = useState<Record<string, LikertValue>>(
    () => Object.fromEntries(ALL_LIKERT.map((q) => [q, null]))
  );
  const [mcAnswer, setMcAnswer] = useState<string | null>(null);
  const [open1, setOpen1] = useState("");
  const [open2, setOpen2] = useState("");
  const [open3, setOpen3] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    api.getSurveyResponse(projectId).then((r: any) => {
      if (r.response) setAlreadyDone(true);
    }).catch(() => {});
  }, [projectId]);

  const canSubmit = ALL_LIKERT.every((q) => likert[q] !== null) && mcAnswer !== null;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await api.submitProjectSurvey(projectId, {
        likert: Object.fromEntries(ALL_LIKERT.map((q) => [q, likert[q]!])),
        mc_answer: mcAnswer ?? "",
        open_q1: open1.trim(),
        open_q2: open2.trim(),
        open_q3: open3.trim(),
      });
      setSubmitted(true);
    } catch { alert(t("common.error")); }
    finally { setSubmitting(false); }
  };

  if (submitted || alreadyDone) {
    return (
      <div className="page" style={{ justifyContent: "center", minHeight: "100dvh" }}>
        <div className="welcome-card">
          <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
          <div className="badge green" style={{ margin: "0 auto 12px" }}>{t("survey.complete")}</div>
          <h2>{t("survey.thankYou")}</h2>
          <p style={{ marginTop: 8 }}>{t("survey.thankYouDesc")}</p>
          <Link to={`/projects/${projectId}`} className="btn primary full-width" style={{ marginTop: 20, textDecoration: "none" }}>
            ← {t("projects.backToProject")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Hero */}
      <div className="hero-banner">
        <h1>{t("survey.title")}</h1>
        <p>{t("survey.subtitle")}</p>
      </div>

      {/* Likert legend */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {LIKERT_OPTIONS.map((v) => (
            <div key={v} style={{ textAlign: "center", flex: 1 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "var(--grad-primary)", color: "#fff",
                fontWeight: 700, fontSize: 13,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 4px",
              }}>{v}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.3 }}>{t(`survey.scale_${v}`)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Likert sections */}
      {LIKERT_SECTIONS.map((section) => (
        <div className="card" key={section.titleKey}>
          <h3 style={{ color: "var(--color-primary)", borderBottom: "2px solid var(--color-primary)", paddingBottom: 8, marginBottom: 16 }}>
            {t(section.titleKey)}
          </h3>
          {section.questions.map((qKey, qIdx) => (
            <div key={qKey} style={{
              marginBottom: qIdx < section.questions.length - 1 ? 20 : 0,
              paddingBottom: qIdx < section.questions.length - 1 ? 20 : 0,
              borderBottom: qIdx < section.questions.length - 1 ? "1px solid var(--color-border)" : "none",
            }}>
              <p style={{ fontSize: 14, marginBottom: 10, lineHeight: 1.6 }}>
                <strong style={{ color: "var(--color-text-muted)", marginRight: 6 }}>{qIdx + 1}.</strong>
                {t(qKey)}
              </p>
              <div className="label-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginTop: 0, gap: 8 }}>
                {LIKERT_OPTIONS.map((v) => {
                  const sel = likert[qKey] === v;
                  return (
                    <button
                      key={v}
                      className={`label-btn${sel ? " selected" : ""}`}
                      style={{ minHeight: 42, fontSize: 14 }}
                      onClick={() => setLikert((p) => ({ ...p, [qKey]: v }))}
                    >{v}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* MC section */}
      <div className="card">
        <h3 style={{ color: "var(--color-primary)", borderBottom: "2px solid var(--color-primary)", paddingBottom: 8, marginBottom: 16 }}>
          {t("survey.sectionC")}
        </h3>
        <p style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
          <strong style={{ color: "var(--color-text-muted)", marginRight: 6 }}>1.</strong>
          {t("survey.q11")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {MC_OPTIONS.map((optKey) => {
            const sel = mcAnswer === optKey;
            return (
              <button
                key={optKey}
                className={`label-btn${sel ? " selected" : ""}`}
                style={{ textAlign: "left", minHeight: 44, fontSize: 14 }}
                onClick={() => setMcAnswer(optKey)}
              >{t(optKey)}</button>
            );
          })}
        </div>
      </div>

      {/* Open questions */}
      <div className="card">
        <h3 style={{ color: "var(--color-primary)", borderBottom: "2px solid var(--color-primary)", paddingBottom: 8, marginBottom: 16 }}>
          {t("survey.sectionD")}
        </h3>
        {[
          { key: "survey.q12", value: open1, setter: setOpen1 },
          { key: "survey.q13", value: open2, setter: setOpen2 },
          { key: "survey.q14", value: open3, setter: setOpen3 },
        ].map(({ key, value, setter }, idx) => (
          <div className="form-group" key={key} style={{ marginBottom: idx < 2 ? 20 : 0 }}>
            <label>
              <strong style={{ marginRight: 4 }}>{idx + 1}.</strong>
              {t(key)}
            </label>
            <textarea rows={3} value={value} onChange={(e) => setter(e.target.value)} placeholder={t("survey.openPlaceholder")} />
          </div>
        ))}
      </div>

      {/* Submit */}
      <button
        className="btn primary full-width lg"
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        style={{ marginBottom: 32 }}
      >
        {submitting ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <>{t("survey.submit")} →</>}
      </button>
    </div>
  );
}
