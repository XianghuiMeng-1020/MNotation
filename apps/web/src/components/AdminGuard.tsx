import { Navigate } from "react-router-dom";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const isAdmin = true;
  return isAdmin ? <>{children}</> : <Navigate to="/login" replace />;
}
