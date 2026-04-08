import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DataItemDisplay } from "../../components/DataItemDisplay";
import { LabelComparison } from "../../components/LabelComparison";
import { api, type LlmMode } from "../../lib/api";

export function LlmLabelingPage() {
  const { projectId = "" } = useParams();
  const [item, setItem] = useState<any>(null);
  const [mode, setMode] = useState<LlmMode>("prompt1");
  const [customPrompt, setCustomPrompt] = useState("");
  const [prediction, setPrediction] = useState<any>(null);

  useEffect(() => {
    api.nextLabelItem(projectId, "normal", "llm").then((r: any) => setItem(r.item ?? null)).catch(() => undefined);
  }, [projectId]);

  const run = async () => {
    if (!item) return;
    const res = await api.runLlm(projectId, { item_id: item.item_id, mode, custom_prompt_text: customPrompt });
    setPrediction(res);
  };

  return (
    <div className="page">
      <div className="card">
        <h2>LLM Labeling</h2>
        <div className="segmented">
          {(["prompt1", "prompt2", "custom"] as LlmMode[]).map((x) => (
            <button key={x} className={`segmented-btn ${mode === x ? "active" : ""}`} onClick={() => setMode(x)}>
              {x === "prompt1" ? "Prompt 1" : x === "prompt2" ? "Prompt 2" : "Custom Prompt"}
            </button>
          ))}
        </div>
        {mode === "custom" ? <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} /> : null}
        <button className="btn primary" onClick={run}>Run LLM</button>
      </div>
      <DataItemDisplay item={item} />
      <LabelComparison manualLabel={item?.my_label} llmLabel={prediction?.predicted_label ?? item?.llm_label} />
    </div>
  );
}
