import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChunkingPreview, type ChunkConfig } from "../../components/ChunkingPreview";
import { CodingSchemeEditor, type CodeLabel } from "../../components/CodingSchemeEditor";
import { DataUploader } from "../../components/DataUploader";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

const TOTAL_STEPS = 8;

const STEP_LABELS = [
  "wizard.step1", "wizard.step2", "wizard.step3", "wizard.step4",
  "wizard.step5", "wizard.step6", "wizard.step7", "wizard.step8"
] as const;

export function CreateProjectPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dataType, setDataType] = useState("dialogue");
  const [samplingMethod, setSamplingMethod] = useState("random");
  const [codingMethod, setCodingMethod] = useState("both");
  const [chunkConfig, setChunkConfig] = useState<ChunkConfig>({ mode: "row_per_item" });
  const [codes, setCodes] = useState<CodeLabel[]>([]);
  const [emails, setEmails] = useState("");
  // File state
  const [fileBase64, setFileBase64] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileFormat, setFileFormat] = useState("txt");
  const [previewCols, setPreviewCols] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);

  const buildLocalPreview = async (file: File, format: string) => {
    try {
      const text = await file.text();
      if (format === "csv") {
        const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 21);
        if (lines.length === 0) return;
        const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        const rows = lines.slice(1).map((line) => {
          const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
          return Object.fromEntries(headers.map((h, idx) => [h, values[idx] ?? ""]));
        });
        setPreviewCols(headers);
        setPreviewRows(rows);
        return;
      }

      if (format === "jsonl") {
        const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 20);
        const rows = lines.map((line) => JSON.parse(line));
        const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
        setPreviewCols(cols);
        setPreviewRows(rows.map((r) => Object.fromEntries(cols.map((c) => [c, String(r[c] ?? "")]))));
        return;
      }

      if (format === "json") {
        const data = JSON.parse(text);
        const rows = Array.isArray(data) ? data.slice(0, 20) : [];
        const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
        setPreviewCols(cols);
        setPreviewRows(rows.map((r) => Object.fromEntries(cols.map((c) => [c, String(r[c] ?? "")]))));
        return;
      }

      const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 20);
      setPreviewCols(["text"]);
      setPreviewRows(lines.map((line) => ({ text: line })));
    } catch {
      setPreviewCols([]);
      setPreviewRows([]);
    }
  };

  const canNext = () => {
    if (step === 1) return name.trim().length > 0;
    if (step === 3) return fileBase64.length > 0;
    return true;
  };

  const handleFileSelected = async (file: File, base64: string, format: string) => {
    setFileBase64(base64);
    setFileName(file.name);
    setFileFormat(format);
    await buildLocalPreview(file, format);
  };

  const create = async () => {
    setCreating(true);
    setError("");
    try {
      const warnings: string[] = [];
      const res = await api.createProject({
        name,
        description,
        data_type: dataType,
        granularity: chunkConfig.mode,
        sampling_method: samplingMethod,
        coding_method: codingMethod,
        coding_scheme: codes,
        invite_emails: emails.split(",").map((x) => x.trim()).filter(Boolean)
      }) as any;
      const projectId = res.project_id;

      // Upload dataset if provided
      if (fileBase64 && fileName) {
        try {
          const dsRes = await api.uploadDataset(projectId, {
            filename: fileName,
            file_format: fileFormat,
            content_base64: fileBase64
          }) as any;
          const datasetId = dsRes.dataset_id;
          await api.configureDataset(projectId, datasetId, chunkConfig);
          await api.processDataset(projectId, datasetId);
        } catch {
          warnings.push(t("wizard.warnDataset"));
        }
      }

      // Set coding scheme if provided
      if (codes.length > 0) {
        try {
          await api.setCodingScheme(projectId, { labels: codes, change_note: "Initial coding scheme" });
        } catch {
          warnings.push(t("wizard.warnScheme"));
        }
      }

      // Generate assignments
      try {
        await api.generateAssignments(projectId);
      } catch {
        warnings.push(t("wizard.warnAssignments"));
      }

      if (warnings.length > 0) {
        window.alert(warnings.join("\n"));
      }

      nav(`/projects/${projectId}`);
    } catch (e: any) {
      setError(e.message ?? t("common.error"));
    } finally {
      setCreating(false);
    }
  };

  const DATA_TYPE_OPTIONS = [
    { value: "dialogue", icon: "💬", label: t("projects.dataType.dialogue") },
    { value: "document", icon: "📄", label: t("projects.dataType.document") },
    { value: "sentence", icon: "📝", label: t("projects.dataType.sentence") },
    { value: "generic", icon: "🔤", label: t("projects.dataType.generic") },
  ];

  return (
    <div className="page" style={{ maxWidth: "700px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: "0 0 0.5rem" }}>{t("projects.new")}</h1>
        {/* Step indicator */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: "4px",
                borderRadius: "2px",
                background: i + 1 <= step ? "var(--accent)" : "var(--border-color)",
                transition: "background 0.3s"
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
          {t(STEP_LABELS[step - 1])} ({step}/{TOTAL_STEPS})
        </div>
      </div>

      {/* Step 1: Project Info */}
      {step === 1 && (
        <div className="card animate-pageIn">
          <h2>{t("wizard.step1")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div>
              <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem" }}>{t("wizard.projectName")} *</label>
              <input className="input" placeholder={t("wizard.projectNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem" }}>{t("wizard.projectDescription")}</label>
              <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Data Type */}
      {step === 2 && (
        <div className="card animate-pageIn">
          <h2>{t("wizard.step2")}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {DATA_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDataType(opt.value)}
                aria-pressed={dataType === opt.value}
                style={{
                  padding: "1.25rem",
                  borderRadius: "10px",
                  border: `2px solid ${dataType === opt.value ? "var(--accent)" : "var(--border-color)"}`,
                  cursor: "pointer",
                  textAlign: "center",
                  background: dataType === opt.value ? "rgba(99,102,241,0.05)" : "transparent",
                  transition: "all 0.2s",
                  appearance: "none"
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "0.4rem" }}>{opt.icon}</div>
                <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{opt.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Upload Data */}
      {step === 3 && (
        <div className="animate-pageIn">
          <DataUploader onSelected={handleFileSelected} />
          {fileName && (
            <div className="card" style={{ marginTop: "1rem" }}>
              <p style={{ margin: 0 }}>
                <strong>{t("upload.file")}:</strong> {fileName} ({fileFormat.toUpperCase()})
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Configure Chunking */}
      {step === 4 && (
        <div className="animate-pageIn">
          <ChunkingPreview
            config={chunkConfig}
            onChange={setChunkConfig}
            columns={previewCols}
            preview={previewRows}
          />
        </div>
      )}

      {/* Step 5: Coding Scheme */}
      {step === 5 && (
        <div className="animate-pageIn">
          <CodingSchemeEditor value={codes} onChange={setCodes} />
        </div>
      )}

      {/* Step 6: Labeling Mode */}
      {step === 6 && (
        <div className="card animate-pageIn">
          <h2>{t("wizard.step6")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label style={{ fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>{t("projects.samplingMethod")}</label>
              <div className="segmented">
                {(["random", "active_learning"] as const).map((v) => (
                  <button key={v} className={`segmented-btn ${samplingMethod === v ? "active" : ""}`} onClick={() => setSamplingMethod(v)}>
                    {t(`projects.samplingMethod.${v}` as any)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>{t("projects.codingMethod")}</label>
              <div className="segmented">
                {(["manual", "llm", "both"] as const).map((v) => (
                  <button key={v} className={`segmented-btn ${codingMethod === v ? "active" : ""}`} onClick={() => setCodingMethod(v)}>
                    {t(`projects.codingMethod.${v}` as any)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 7: Invite Team */}
      {step === 7 && (
        <div className="card animate-pageIn">
          <h2>{t("wizard.step7")}</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "1rem" }}>
            {t("wizard.inviteCoders")}
          </p>
          <textarea
            className="input"
            rows={4}
            placeholder={t("wizard.invitePlaceholder")}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
          />
        </div>
      )}

      {/* Step 8: Review & Create */}
      {step === 8 && (
        <div className="card animate-pageIn">
          <h2>{t("wizard.step8")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", fontSize: "0.9rem" }}>
            {[
              { label: t("common.name"), value: name },
              { label: t("projects.dataType"), value: t(`projects.dataType.${dataType}` as any) },
              { label: t("projects.samplingMethod"), value: t(`projects.samplingMethod.${samplingMethod}` as any) },
              { label: t("projects.codingMethod"), value: t(`projects.codingMethod.${codingMethod}` as any) },
              { label: t("wizard.step3"), value: fileName || t("common.none") },
              { label: t("chunk.mode"), value: t(`chunk.mode.${chunkConfig.mode}` as any) },
              { label: t("settings.scheme"), value: codes.length > 0 ? codes.map((c) => c.code).join(", ") : t("common.none") },
              { label: t("wizard.step7"), value: emails || t("common.none") },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", gap: "0.5rem" }}>
                <span style={{ color: "var(--text-muted)", minWidth: "120px" }}>{label}:</span>
                <span style={{ fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
          {error && <p style={{ color: "#ef4444", marginTop: "1rem" }}>{error}</p>}
        </div>
      )}

      {/* Navigation buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.25rem" }}>
        <button
          className="btn"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          ← {t("common.back")}
        </button>
        {step < TOTAL_STEPS ? (
          <button
            className="btn primary"
            onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
            disabled={!canNext()}
          >
            {t("common.next")} →
          </button>
        ) : (
          <button
            className="btn primary"
            onClick={create}
            disabled={creating || !name.trim()}
          >
            {creating ? t("common.loading") : t("wizard.createAndLaunch")}
          </button>
        )}
      </div>
    </div>
  );
}
