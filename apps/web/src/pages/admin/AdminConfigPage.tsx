import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AdminNav } from "../../components/AdminNav";
import { api } from "../../lib/api";

export function AdminConfigPage() {
  const { projectId = "" } = useParams();
  const [prompt1, setPrompt1] = useState("");
  const [prompt2, setPrompt2] = useState("");
  useEffect(() => {
    api.getPrompts(projectId).then((r: any) => {
      setPrompt1(r.prompt1 ?? "");
      setPrompt2(r.prompt2 ?? "");
    });
  }, [projectId]);
  return (
    <div className="page">
      <AdminNav />
      <div className="card">
        <h2>Admin Config</h2>
        <h3>Prompt 1</h3>
        <textarea value={prompt1} onChange={(e) => setPrompt1(e.target.value)} />
        <h3>Prompt 2</h3>
        <textarea value={prompt2} onChange={(e) => setPrompt2(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn primary" onClick={() => api.setPrompts(projectId, { prompt1, prompt2 })}>Save Prompts</button>
          <button className="btn" onClick={() => api.runAl(projectId)}>Run Active Learning</button>
        </div>
      </div>
    </div>
  );
}
