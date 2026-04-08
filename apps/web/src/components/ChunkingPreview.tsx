import { useI18n } from "../lib/i18n";

export type ChunkConfig = {
  mode: "row_per_item" | "dialogue_turns" | "paragraphs" | "sentences" | "sliding_window" | "custom_delimiter";
  text_column?: string;
  speaker_column?: string;
  context_columns?: string[];
  turn_size?: number;
  window_size?: number;
  overlap?: number;
  custom_delimiter?: string;
  min_chunk_length?: number;
};

type Props = {
  config: ChunkConfig;
  onChange: (config: ChunkConfig) => void;
  columns?: string[];
  preview?: Record<string, string>[];
};

const MODES: ChunkConfig["mode"][] = [
  "row_per_item",
  "dialogue_turns",
  "paragraphs",
  "sentences",
  "sliding_window",
  "custom_delimiter"
];

export function ChunkingPreview({ config, onChange, columns = [], preview = [] }: Props) {
  const { t } = useI18n();
  const set = (patch: Partial<ChunkConfig>) => onChange({ ...config, ...patch });

  // Apply chunking to preview rows client-side for a quick preview
  const buildPreview = (): string[] => {
    const textCol = config.text_column ?? columns[0] ?? "text";
    if (preview.length === 0) return [];
    const texts = preview.map((r) => r[textCol] ?? "").filter(Boolean);

    if (config.mode === "row_per_item") return texts.slice(0, 5);

    if (config.mode === "paragraphs") {
      return texts.join("\n").split(/\n{2,}/).filter(Boolean).slice(0, 5);
    }

    if (config.mode === "sentences") {
      return texts.join(" ").split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 5);
    }

    if (config.mode === "dialogue_turns") {
      const turnSize = Math.max(1, config.turn_size ?? 1);
      const result: string[] = [];
      for (let i = 0; i < Math.min(preview.length, 10); i += turnSize) {
        const batch = preview.slice(i, i + turnSize);
        const speaker = config.speaker_column;
        result.push(batch.map((r) => speaker ? `${r[speaker] ?? "?"}: ${r[textCol] ?? ""}` : r[textCol] ?? "").join("\n"));
        if (result.length >= 5) break;
      }
      return result;
    }

    if (config.mode === "sliding_window") {
      const tokens = texts.join(" ").split(/\s+/).filter(Boolean);
      const size = Math.max(10, config.window_size ?? 80);
      const overlap = Math.max(0, Math.min(size - 1, config.overlap ?? 20));
      const step = Math.max(1, size - overlap);
      const result: string[] = [];
      for (let i = 0; i < tokens.length && result.length < 5; i += step) {
        result.push(tokens.slice(i, i + size).join(" "));
        if (i + size >= tokens.length) break;
      }
      return result;
    }

    if (config.mode === "custom_delimiter") {
      const delim = config.custom_delimiter ? new RegExp(config.custom_delimiter, "g") : /\n+/g;
      return texts.join("\n").split(delim).filter(Boolean).slice(0, 5);
    }

    return texts.slice(0, 5);
  };

  const previewItems = buildPreview();

  return (
    <div className="card">
      <h3 style={{ marginBottom: "1rem" }}>{t("chunk.title")}</h3>

      {/* Mode selector */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ fontWeight: 500, display: "block", marginBottom: "0.4rem" }}>{t("chunk.mode")}</label>
        <select
          className="input"
          value={config.mode}
          onChange={(e) => set({ mode: e.target.value as ChunkConfig["mode"] })}
        >
          {MODES.map((m) => (
            <option key={m} value={m}>{t(`chunk.mode.${m}` as any)}</option>
          ))}
        </select>
      </div>

      {/* Column selectors */}
      {columns.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
          <div>
            <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem", fontSize: "0.85rem" }}>{t("chunk.textColumn")}</label>
            <select className="input" value={config.text_column ?? ""} onChange={(e) => set({ text_column: e.target.value })}>
              <option value="">(auto)</option>
              {columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {config.mode === "dialogue_turns" && (
            <div>
              <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem", fontSize: "0.85rem" }}>{t("chunk.speakerColumn")}</label>
              <select className="input" value={config.speaker_column ?? ""} onChange={(e) => set({ speaker_column: e.target.value })}>
                <option value="">(none)</option>
                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Mode-specific settings */}
      {config.mode === "dialogue_turns" && (
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem", fontSize: "0.85rem" }}>{t("chunk.turnSize")}</label>
          <input type="number" className="input" min={1} max={20} value={config.turn_size ?? 1} onChange={(e) => set({ turn_size: Number(e.target.value) })} style={{ width: "100px" }} />
        </div>
      )}

      {config.mode === "sliding_window" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
          <div>
            <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem", fontSize: "0.85rem" }}>{t("chunk.windowSize")}</label>
            <input type="number" className="input" min={10} max={1000} value={config.window_size ?? 80} onChange={(e) => set({ window_size: Number(e.target.value) })} />
          </div>
          <div>
            <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem", fontSize: "0.85rem" }}>{t("chunk.overlap")}</label>
            <input type="number" className="input" min={0} value={config.overlap ?? 20} onChange={(e) => set({ overlap: Number(e.target.value) })} />
          </div>
        </div>
      )}

      {config.mode === "custom_delimiter" && (
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ fontWeight: 500, display: "block", marginBottom: "0.3rem", fontSize: "0.85rem" }}>{t("chunk.delimiter")}</label>
          <input className="input" placeholder="e.g. ---" value={config.custom_delimiter ?? ""} onChange={(e) => set({ custom_delimiter: e.target.value })} />
        </div>
      )}

      {/* Preview */}
      <div>
        <h4 style={{ marginBottom: "0.5rem" }}>{t("chunk.preview")}</h4>
        {previewItems.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{t("chunk.previewEmpty")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {previewItems.map((item, i) => (
              <div key={i} style={{
                background: "var(--surface-raised)",
                borderRadius: "6px",
                padding: "0.5rem 0.75rem",
                fontSize: "0.85rem",
                lineHeight: 1.5,
                borderLeft: "3px solid var(--accent)"
              }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginRight: "0.4rem" }}>#{i + 1}</span>
                {item.length > 300 ? item.slice(0, 300) + "…" : item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
