import { Link, useParams } from "react-router-dom";

export function AdminNav() {
  const { projectId } = useParams();
  return (
    <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Link to={`/projects/${projectId}/admin`}>Dashboard</Link>
      <Link to={`/projects/${projectId}/admin/config`}>Config</Link>
      <Link to={`/projects/${projectId}/settings`}>Settings</Link>
    </div>
  );
}
