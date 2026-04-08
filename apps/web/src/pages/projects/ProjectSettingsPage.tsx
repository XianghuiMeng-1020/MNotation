import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CodingSchemeEditor, type CodeLabel } from "../../components/CodingSchemeEditor";
import { TeamManager } from "../../components/TeamManager";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { storage } from "../../lib/storage";

type Tab = "general" | "team" | "scheme" | "config" | "prompts" | "al" | "danger";

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
