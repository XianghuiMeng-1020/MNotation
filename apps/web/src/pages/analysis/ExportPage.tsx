import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useEffect, useRef, useState } from "react";

export function ExportPage() {
  const { projectId = "" } = useParams();
  const { t } = useI18n();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState("");
  const [estimatedSize, setEstimatedSize] = useState<string>("");
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api.getStatsOverview(projectId)
      .then((r: any) => {
        const roughBytes = Number(r.total_items ?? 0) * 800 + Number(r.total_labels ?? 0) * 350;
        const mb = roughBytes / (1024 * 1024);
        setEstimatedSize(`${mb < 1 ? "<1" : mb.toFixed(1)} MB`);
      })
      .catch(() => setEstimatedSize(""));
  }, [projectId]);

  const download = async (format: "csv" | "json" | "xlsx" | "jsonl" | "refi-qda" | "parquet" | "parquet-zstd" | "arrow") => {
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setDownloading(format);
    setProgressText(t("export.preparing"));
    setError("");
    try {
      const { blob, filename } = await api.exportData(projectId, format, ctrl.signal);
      setProgressText(t("export.processing"));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? `${projectId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setProgressText(t("export.done"));
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setError(t("export.cancelled"));
      } else {
        setError(e?.message ?? t("common.error"));
      }
    } finally {
      ctrlRef.current = null;
      setTimeout(() => setProgressText(""), 1200);
      setDownloading(null);
    }
  };

  const cancelDownload = () => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    setDownloading(null);
    setProgressText("");
  };

  return (
    <div className="page">
      <div className="card">
        <h2>{t("export.title")}</h2>
        <p>{t("export.description")}</p>
        {estimatedSize && (
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: -4 }}>
            {t("export.estimatedSize")}: {estimatedSize}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => download("csv")} disabled={downloading !== null}>
            {downloading === "csv" ? t("common.loading") : "CSV"}
          </button>
          <button className="btn" onClick={() => download("json")} disabled={downloading !== null}>
            {downloading === "json" ? t("common.loading") : "JSON"}
          </button>
          <button className="btn" onClick={() => download("xlsx")} disabled={downloading !== null}>
            {downloading === "xlsx" ? t("common.loading") : "XLSX"}
          </button>
          <button className="btn" onClick={() => download("jsonl")} disabled={downloading !== null}>
            {downloading === "jsonl" ? t("common.loading") : "JSONL"}
          </button>
          <button className="btn" onClick={() => download("refi-qda")} disabled={downloading !== null}>
            {downloading === "refi-qda" ? t("common.loading") : "REFI-QDA (XML)"}
          </button>
          <button className="btn" onClick={() => download("parquet")} disabled={downloading !== null}>
            {downloading === "parquet" ? t("common.loading") : "Parquet (labels)"}
          </button>
          <button className="btn" onClick={() => download("parquet-zstd")} disabled={downloading !== null}>
            {downloading === "parquet-zstd" ? t("common.loading") : "Parquet ZSTD"}
          </button>
          <button className="btn" onClick={() => download("arrow")} disabled={downloading !== null}>
            {downloading === "arrow" ? t("common.loading") : "Arrow IPC (labels)"}
          </button>
          <button className="btn" onClick={cancelDownload} disabled={!downloading}>
            {t("export.cancel")}
          </button>
        </div>
        {progressText && <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-muted)" }}>{progressText}</div>}
        {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}
