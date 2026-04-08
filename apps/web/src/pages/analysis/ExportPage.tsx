import { useParams } from "react-router-dom";
import { api } from "../../lib/api";

export function ExportPage() {
  const { projectId = "" } = useParams();
  return (
    <div className="page">
      <div className="card">
        <h2>Export</h2>
        <p>Export labels, conflicts, IRR snapshots, behavior data and messages.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => api.exportData(projectId, "csv")}>CSV</button>
          <button className="btn" onClick={() => api.exportData(projectId, "json")}>JSON</button>
          <button className="btn" onClick={() => api.exportData(projectId, "xlsx")}>XLSX</button>
        </div>
      </div>
    </div>
  );
}
