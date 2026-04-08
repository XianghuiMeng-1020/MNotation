import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type LikertValue = 1 | 2 | 3 | 4 | 5 | null;

const LIKERT_OPTIONS = [1, 2, 3, 4, 5] as const;

const LIKERT_SECTIONS = [
  {
    titleKey: "survey.sectionA",
    questions: ["survey.q1", "survey.q2", "survey.q4"],
  },
  {
    titleKey: "survey.sectionB",
    questions: ["survey.q7", "survey.q10"],
  },
] as const;

const ALL_LIKERT_QUESTIONS = LIKERT_SECTIONS.flatMap((s) => s.questions);

const MC_OPTIONS = [
  "survey.mc_a",
  "survey.mc_b",
  "survey.mc_c",
  "survey.mc_d",
] as const;

export function SurveyPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();

  const [likert, setLikert] = useState<Record<string, LikertValue>>(
    () => Object.fromEntries(ALL_LIKERT_QUESTIONS.map((q) => [q, null]))
  );
  const [mcAnswer, setMcAnswer] = useState<string | null>(null);
  const [open1, setOpen1] = useState("");
  const [open2, setOpen2] = useState("");
  const [open3, setOpen3] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    api.getSurveyResponse(projectId).then((r: any) => {
      if (r.response) setAlreadySubmitted(true);
    }).catch(() => {});
  }, [projectId]);

  const allLikertAnswered = ALL_LIKERT_QUESTIONS.every((q) => likert[q] !== null);
  const canSubmit = allLikertAnswered && mcAnswer !== null;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await api.submitSurvey(projectId, {
        likert: Object.fromEntries(ALL_LIKERT_QUESTIONS.map((q) => [q, likert[q]!])),
        mc_answer: mcAnswer ?? "",
        open_q1: open1.trim(),
        open_q2: open2.trim(),
        open_q3: open3.trim(),
      });
      setSubmitted(true);
    } catch {
      alert(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted || alreadySubmitted) {
    return (
      <div className="page" style={{ justifyContent: "center", minHeight: "100dvh" }}>
        <div
          style={{
            maxWidth: 480,
            margin: "0 auto",
            padding: "3rem 2rem",
            background: "var(--surface)",
            borderRadius: "20px",
            boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--success)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 12,
            }}
          >
            {t("survey.complete")}
          </div>
          <h2 style={{ margin: "0 0 0.5rem" }}>{t("survey.thankYou")}</h2>
          <p style={{ color: "var(--text-muted)", marginTop: 8 }}>{t("survey.thankYouDesc")}</p>
          <Link
            to={`/projects/${projectId}`}
            className="btn primary"
            style={{ display: "inline-block", marginTop: "1.5rem", textDecoration: "none" }}
          >
            ← {t("projects.backToProject")}
          </Link>
        </div>
      </div>
    );
  }

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
        <h1 style={{ margin: "0 0 0.3rem", fontSize: "1.5rem" }}>{t("survey.title")}</h1>
        <p style={{ margin: 0, opacity: 0.88, fontSize: "0.9rem" }}>{t("survey.subtitle")}</p>
      </div>

      <div
        className="card"
        style={{ marginBottom: "1.25rem" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {LIKERT_OPTIONS.map((v) => (
            <div key={v} style={{ textAlign: "center", flex: 1 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 4px",
                }}
              >
                {v}
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", lineHeight: 1.3 }}>
                {t(`survey.scale_${v}`)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {LIKERT_SECTIONS.map((section) => (
        <div className="card" key={section.titleKey} style={{ marginBottom: "1.25rem" }}>
          <h3
            style={{
              margin: "0 0 1.25rem",
              fontSize: "1rem",
              color: "var(--accent)",
              borderBottom: "2px solid var(--accent)",
              paddingBottom: "0.5rem",
            }}
          >
            {t(section.titleKey)}
          </h3>
          {section.questions.map((qKey, qIdx) => (
            <div
              key={qKey}
              style={{
                marginBottom: "1.25rem",
                paddingBottom: "1.25rem",
                borderBottom:
                  qIdx < section.questions.length - 1
                    ? "1px solid var(--border)"
                    : "none",
              }}
            >
              <p
                style={{
                  fontSize: "0.92rem",
                  marginBottom: "0.75rem",
                  lineHeight: 1.6,
                  color: "var(--text)",
                }}
              >
                <strong style={{ color: "var(--text-muted)", marginRight: 6 }}>
                  {qIdx + 1}.
                </strong>
                {t(qKey)}
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {LIKERT_OPTIONS.map((v) => {
                  const selected = likert[qKey] === v;
                  return (
                    <label
                      key={v}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name={qKey}
                        value={v}
                        checked={selected}
                        onChange={() => setLikert((prev) => ({ ...prev, [qKey]: v }))}
                        style={{ display: "none" }}
                      />
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                          background: selected ? "var(--accent)" : "transparent",
                          color: selected ? "#fff" : "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          transition: "all 0.15s",
                        }}
                      >
                        {v}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h3
          style={{
            margin: "0 0 1.25rem",
            fontSize: "1rem",
            color: "var(--accent)",
            borderBottom: "2px solid var(--accent)",
            paddingBottom: "0.5rem",
          }}
        >
          {t("survey.sectionC")}
        </h3>
        <p style={{ fontSize: "0.92rem", marginBottom: "0.75rem", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text-muted)", marginRight: 6 }}>1.</strong>
          {t("survey.q11")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {MC_OPTIONS.map((optKey) => {
            const selected = mcAnswer === optKey;
            return (
              <label
                key={optKey}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                  background: selected ? "rgba(99,102,241,0.07)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <input
                  type="radio"
                  name="mc_q11"
                  value={optKey}
                  checked={selected}
                  onChange={() => setMcAnswer(optKey)}
                  style={{ display: "none" }}
                />
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                    background: selected ? "var(--accent)" : "transparent",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <span style={{ fontSize: "0.9rem", lineHeight: 1.5, color: "var(--text)" }}>
                  {t(optKey)}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3
          style={{
            margin: "0 0 1.25rem",
            fontSize: "1rem",
            color: "var(--accent)",
            borderBottom: "2px solid var(--accent)",
            paddingBottom: "0.5rem",
          }}
        >
          {t("survey.sectionD")}
        </h3>
        {[
          { key: "survey.q12", value: open1, setter: setOpen1 },
          { key: "survey.q13", value: open2, setter: setOpen2 },
          { key: "survey.q14", value: open3, setter: setOpen3 },
        ].map(({ key, value, setter }, idx) => (
          <div
            key={key}
            style={{
              marginBottom: "1.25rem",
              paddingBottom: idx < 2 ? "1.25rem" : 0,
              borderBottom: idx < 2 ? "1px solid var(--border)" : "none",
            }}
          >
            <p style={{ fontSize: "0.92rem", marginBottom: "0.5rem", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--text-muted)", marginRight: 6 }}>{idx + 1}.</strong>
              {t(key)}
            </p>
            <textarea
              rows={3}
              value={value}
              onChange={(e) => setter(e.target.value)}
              placeholder={t("survey.openPlaceholder")}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "8px",
                border: "1.5px solid var(--border)",
                background: "var(--surface-raised)",
                color: "var(--text)",
                fontSize: "0.9rem",
                resize: "vertical",
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        ))}
      </div>

      <button
        className="btn primary"
        style={{
          width: "100%",
          padding: "1rem",
          fontSize: "1rem",
          fontWeight: 600,
          marginBottom: "2rem",
          borderRadius: "10px",
          opacity: canSubmit ? 1 : 0.5,
        }}
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
      >
        {submitting ? (
          <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
        ) : (
          <>{t("survey.submit")} →</>
        )}
      </button>
    </div>
  );
}
