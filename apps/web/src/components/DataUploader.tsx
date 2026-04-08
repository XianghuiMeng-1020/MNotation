import { useRef, useState } from "react";
import { useI18n } from "../lib/i18n";

type Props = {
  onSelected: (file: File, base64: string, format: string) => void;
  disabled?: boolean;
};

const ACCEPTED_FORMATS = [".csv", ".json", ".jsonl", ".xlsx", ".xls", ".txt", ".md", ".docx", ".pdf"];

export function DataUploader({ onSelected, disabled }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const processFile = async (file: File) => {
    setLoading(true);
    setError("");
    try {
      const bytes = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "txt";
      setSelectedFile(file);
      onSelected(file, b64, ext);
    } catch (e) {
      setError(t("upload.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="card">
      <h3 style={{ marginBottom: "1rem" }}>{t("upload.title")}</h3>
      <div
        onClick={() => !disabled && !loading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? "var(--accent)" : "var(--border-color)"}`,
          borderRadius: "12px",
          padding: "2rem",
          textAlign: "center",
          cursor: disabled || loading ? "not-allowed" : "pointer",
          background: dragging ? "rgba(99,102,241,0.05)" : "var(--surface-raised)",
          transition: "all 0.2s",
          opacity: disabled ? 0.5 : 1
        }}
      >
        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📂</div>
        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>{t("upload.uploading")}</p>
        ) : selectedFile ? (
          <>
            <p style={{ fontWeight: 600, color: "var(--accent)" }}>✓ {t("upload.selected")}: {selectedFile.name}</p>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </>
        ) : (
          <>
            <p style={{ fontWeight: 500 }}>{t("upload.dragDrop")}</p>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{t("upload.supportedFormats")}</p>
          </>
        )}
        {error && <p style={{ color: "#ef4444", marginTop: "0.5rem" }}>{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FORMATS.join(",")}
        onChange={handleChange}
        style={{ display: "none" }}
      />
    </div>
  );
}
