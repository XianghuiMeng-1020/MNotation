import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CodingSchemeEditor, type CodeLabel } from "../../components/CodingSchemeEditor";
import { FewShotManager } from "../../components/FewShotManager";
import { TeamManager } from "../../components/TeamManager";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { storage } from "../../lib/storage";

type Tab = "general" | "team" | "scheme" | "config" | "prompts" | "al" | "v3" | "danger";

export function ProjectSettingsPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("general");
  const [project, setProject] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [scheme, setScheme] = useState<CodeLabel[]>([]);
  const [schemeVersion, setSchemeVersion] = useState(1);
  const [schemeHistory, setSchemeHistory] = useState<any[]>([]);
  const [prompt1, setPrompt1] = useState("");
  const [prompt2, setPrompt2] = useState("");
  const [settings, setSettings] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [alRunning, setAlRunning] = useState(false);
  const [alDone, setAlDone] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [v3Suggest, setV3Suggest] = useState<any>(null);
  const [v3Loading, setV3Loading] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [audit, setAudit] = useState<any[]>([]);
  const [siProvider, setSiProvider] = useState<"qualtrics" | "surveymonkey">("qualtrics");
  const [siDc, setSiDc] = useState("ca1");
  const [siSurvey, setSiSurvey] = useState("");
  const [siToken, setSiToken] = useState("");
  const [siField, setSiField] = useState("");
  const [siBusy, setSiBusy] = useState(false);
  const [siMsg, setSiMsg] = useState("");
  const currentUserId = storage.get("userId") ?? "";

  const load = async () => {
    if (!projectId) return;
    try {
      const [pRes, mRes, sRes, prmRes, histRes] = await Promise.all([
        api.getProject(projectId) as any,
        api.getMembers(projectId) as any,
        api.getCodingScheme(projectId) as any,
        api.getProjectPrompts(projectId) as any,
        api.getCodingSchemeHistory(projectId) as any
      ]);
      setProject(pRes.project);
      setMembers(mRes.members ?? []);
      const labels = sRes?.labels ?? [];
      setScheme(labels);
      setSchemeVersion(sRes?.version ?? 1);
      setSchemeHistory(histRes?.history ?? []);
      setPrompt1(prmRes?.prompt1 ?? "");
      setPrompt2(prmRes?.prompt2 ?? "");
      try { setSettings(JSON.parse(pRes.project?.settings_json ?? "{}")); } catch { setSettings({}); }
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, [projectId]);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateProject(projectId, { name: project?.name, description: project?.description, settings_json: settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const savePrompts = async () => {
    setSaving(true);
    try {
      await api.setProjectPrompts(projectId, { prompt1, prompt2 });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const publishScheme = async () => {
    if (scheme.length === 0) return;
    setSaving(true);
    try {
      await api.setCodingScheme(projectId, { labels: scheme, change_note: changeNote });
      setChangeNote("");
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const runAl = async () => {
    setAlRunning(true);
    try {
      await api.runAl(projectId);
      setAlDone(true);
    } finally { setAlRunning(false); }
  };

  const deleteProject = async () => {
    if (!window.confirm(t("projects.deleteConfirm"))) return;
    await api.deleteProject(projectId);
    nav("/projects");
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "general", label: t("settings.general") },
    { id: "team", label: t("settings.team") },
    { id: "scheme", label: t("settings.scheme") },
    { id: "config", label: t("settings.config") },
    { id: "prompts", label: t("settings.prompts") },
    { id: "al", label: t("settings.al") },
    { id: "v3", label: "V3 AI & Ops" },
    { id: "danger", label: t("settings.danger") },
  ];

  return (
    <div className="page">
      <div style={{ marginBottom: "1.5rem" }}>
        <Link to={`/projects/${projectId}`} style={{ fontSize: "0.82rem", color: "var(--text-muted)", textDecoration: "none" }}>← Back</Link>
        <h1 style={{ margin: "0.25rem 0 0" }}>{t("settings.title")}</h1>
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid var(--border-color)", marginBottom: "1.5rem", overflowX: "auto" }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: "0.55rem 1rem",
              border: "none",
              borderBottom: tab === id ? "2px solid var(--accent)" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontWeight: tab === id ? 600 : 400,
              color: tab === id ? "var(--accent)" : "var(--text-muted)",
              fontSize: "0.88rem",
              whiteSpace: "nowrap",
              transition: "all 0.15s"
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {saved && (
        <div style={{ background: "rgba(34,197,94,0.1)", color: "#16a34a", borderRadius: "8px", padding: "0.6rem 1rem", marginBottom: "1rem", fontWeight: 500 }}>
          ✓ {t("settings.saved")}
        </div>
      )}

      {/* General */}
      {tab === "general" && project && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem" }}>{t("common.name")}</label>
            <input className="input" value={project.name ?? ""} onChange={(e) => setProject((p: any) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem" }}>{t("common.description")}</label>
            <textarea className="input" rows={3} value={project.description ?? ""} onChange={(e) => setProject((p: any) => ({ ...p, description: e.target.value }))} />
          </div>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? t("common.loading") : t("common.save")}</button>
        </div>
      )}

      {/* Team */}
      {tab === "team" && (
        <div className="card">
          <TeamManager
            projectId={projectId}
            members={members}
            currentUserId={currentUserId}
            isOwner={members.some((m) => m.user_id === currentUserId && m.role === "owner")}
            onUpdate={load}
          />
        </div>
      )}

      {/* Coding Scheme */}
      {tab === "scheme" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{t("settings.schemeVersion")}:</strong> v{schemeVersion}
            </div>
          </div>
          <CodingSchemeEditor value={scheme} onChange={setScheme} />
          <div className="card" style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem", fontSize: "0.85rem" }}>{t("settings.schemeChangeNote")}</label>
              <input className="input" placeholder="Describe your changes…" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
            </div>
            <button className="btn primary" onClick={publishScheme} disabled={saving || scheme.length === 0}>
              {saving ? t("common.loading") : t("settings.newSchemeVersion")}
            </button>
          </div>
          {schemeHistory.length > 0 && (
            <div className="card">
              <h4 style={{ marginBottom: "0.75rem" }}>{t("settings.schemeHistory")}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {schemeHistory.map((h) => (
                  <div key={h.scheme_id} style={{ fontSize: "0.85rem", display: "flex", gap: "0.5rem", padding: "0.4rem 0", borderBottom: "1px solid var(--border-color)" }}>
                    <span style={{ color: "var(--accent)", fontWeight: 600 }}>v{h.version}</span>
                    <span style={{ color: "var(--text-muted)" }}>{h.change_note || "(no note)"}</span>
                    <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>{new Date(h.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "v3" && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <h3 style={{ margin: "0 0 8px" }}>AI codebook suggestion</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Uses LLM to propose initial codes from your corpus (first N items).</p>
            <button
              className="btn primary"
              disabled={v3Loading}
              onClick={async () => {
                setV3Loading(true);
                try {
                  const r = await api.suggestCodebook(projectId, { sample_limit: 40 });
                  setV3Suggest(r);
                } finally {
                  setV3Loading(false);
                }
              }}
            >
              {v3Loading ? "…" : "Suggest codebook"}
            </button>
            {v3Suggest?.labels?.length > 0 && (
              <pre style={{ marginTop: 12, fontSize: 12, maxHeight: 240, overflow: "auto" }}>{JSON.stringify(v3Suggest.labels, null, 2)}</pre>
            )}
          </div>
          <div>
            <h3 style={{ margin: "0 0 8px" }}>Few-shot 金标示例</h3>
            <FewShotManager projectId={projectId} scheme={scheme} />
          </div>
          <div>
            <h3 style={{ margin: "0 0 8px" }}>Webhook (Slack / 飞书)</h3>
            <input className="input" placeholder="https://hooks.slack.com/..." value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
            <button
              className="btn"
              style={{ marginTop: 8 }}
              onClick={async () => {
                if (!webhookUrl.trim()) return;
                await api.createWebhook(projectId, { url: webhookUrl, events: ["*", "conflict.detected"] });
                setWebhookUrl("");
                alert("Webhook saved");
              }}
            >
              Save webhook
            </button>
          </div>
          <div>
            <h3 style={{ margin: "0 0 8px" }}>Audit log</h3>
            <button
              className="btn"
              onClick={async () => {
                const r = await api.getAuditLog(projectId);
                setAudit(r.entries ?? []);
              }}
            >
              Load audit log
            </button>
            {audit.length > 0 && (
              <pre style={{ marginTop: 12, fontSize: 11, maxHeight: 200, overflow: "auto" }}>{JSON.stringify(audit.slice(0, 20), null, 2)}</pre>
            )}
          </div>
          <div>
            <h3 style={{ margin: "0 0 8px" }}>问卷导入 (Qualtrics / SurveyMonkey)</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
              Qualtrics：填写数据中心、Survey ID、API Token；开放题将导入为 data_items。Token 也可配置在 Worker 环境变量 QUALTRICS_API_TOKEN。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
              <select className="input" value={siProvider} onChange={(e) => setSiProvider(e.target.value as "qualtrics" | "surveymonkey")}>
                <option value="qualtrics">Qualtrics</option>
                <option value="surveymonkey">SurveyMonkey</option>
              </select>
              {siProvider === "qualtrics" && (
                <input className="input" placeholder="数据中心 (如 ca1, yul1)" value={siDc} onChange={(e) => setSiDc(e.target.value)} />
              )}
              <input className="input" placeholder="Survey ID" value={siSurvey} onChange={(e) => setSiSurvey(e.target.value)} />
              <input className="input" type="password" placeholder="API Token（可选若已配置环境变量）" value={siToken} onChange={(e) => setSiToken(e.target.value)} />
              {siProvider === "qualtrics" && (
                <input className="input" placeholder="开放题字段 QID（可选，如 QID3_TEXT）" value={siField} onChange={(e) => setSiField(e.target.value)} />
              )}
              <button
                className="btn primary"
                disabled={siBusy || !siSurvey.trim()}
                onClick={async () => {
                  setSiBusy(true);
                  setSiMsg("");
                  try {
                    const r: any = await api.surveyImport(projectId, {
                      provider: siProvider,
                      datacenter: siDc,
                      survey_id: siSurvey.trim(),
                      api_token: siToken.trim() || undefined,
                      text_field: siField.trim() || undefined
                    });
                    setSiMsg(`成功导入 ${r.imported ?? 0} 条`);
                  } catch (e: any) {
                    setSiMsg(e?.message ?? "导入失败");
                  } finally {
                    setSiBusy(false);
                  }
                }}
              >
                {siBusy ? "导入中…" : "开始导入"}
              </button>
              {siMsg && <p style={{ fontSize: 13, color: siMsg.startsWith("成功") ? "#16a34a" : "#dc2626" }}>{siMsg}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Config */}
      {tab === "config" && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {[
            { key: "enable_ranking", label: t("admin.enableRanking") },
            { key: "enable_comparison", label: t("admin.enableComparison") },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 500 }}>{label}</span>
              <label style={{ position: "relative", display: "inline-block", width: "44px", height: "24px" }}>
                <input
                  type="checkbox"
                  checked={!!settings[key]}
                  onChange={(e) => setSettings((s: any) => ({ ...s, [key]: e.target.checked }))}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0,
                  background: settings[key] ? "var(--accent)" : "var(--border-color)",
                  borderRadius: "24px", transition: "0.2s"
                }}>
                  <span style={{
                    position: "absolute", height: "18px", width: "18px", left: settings[key] ? "22px" : "3px",
                    bottom: "3px", background: "#fff", borderRadius: "50%", transition: "0.2s"
                  }} />
                </span>
              </label>
            </div>
          ))}
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? t("common.loading") : t("common.save")}</button>
        </div>
      )}

      {/* Prompts */}
      {tab === "prompts" && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            { label: t("settings.prompt1"), value: prompt1, set: setPrompt1 },
            { label: t("settings.prompt2"), value: prompt2, set: setPrompt2 },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem" }}>{label}</label>
              <textarea className="input" rows={6} value={value} onChange={(e) => set(e.target.value)} placeholder={`Enter ${label} template here…`} />
            </div>
          ))}
          <button className="btn primary" onClick={savePrompts} disabled={saving}>{saving ? t("common.loading") : t("common.save")}</button>
        </div>
      )}

      {/* AL */}
      {tab === "al" && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
            Trigger the active learning algorithm to identify high-uncertainty items for priority annotation.
          </p>
          {alDone && (
            <div style={{ background: "rgba(34,197,94,0.1)", color: "#16a34a", borderRadius: "8px", padding: "0.6rem 1rem" }}>
              ✓ {t("settings.alDone")}
            </div>
          )}
          <button className="btn primary" onClick={runAl} disabled={alRunning}>
            {alRunning ? t("settings.alRunning") : t("settings.alRun")}
          </button>
          <Link to={`/projects/${projectId}/admin`} className="btn">
            {t("settings.alScores")}
          </Link>
        </div>
      )}

      {/* Danger Zone */}
      {tab === "danger" && (
        <div className="card" style={{ borderColor: "#ef4444" }}>
          <h3 style={{ color: "#ef4444" }}>{t("settings.danger")}</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>{t("projects.deleteConfirm")}</p>
          <button
            className="btn"
            onClick={deleteProject}
            style={{ borderColor: "#ef4444", color: "#ef4444" }}
          >
            {t("projects.delete")}
          </button>
        </div>
      )}
    </div>
  );
}
