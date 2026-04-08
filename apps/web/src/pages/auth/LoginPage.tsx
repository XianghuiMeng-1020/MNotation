import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

export function LoginPage() {
  const nav = useNavigate();
  useEffect(() => {
    api.me().then(() => nav("/projects", { replace: true })).catch(() => undefined);
  }, [nav]);
  return <div className="page"><div className="card">Authenticating with Cloudflare Access...</div></div>;
}
