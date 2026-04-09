import { Suspense, lazy, useEffect, useRef } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import { AdminGuard } from "./components/AdminGuard";
import { CommandPalette } from "./components/CommandPalette";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { useTheme } from "./lib/theme";
import { api } from "./lib/api";
import { ENABLE_ACTIVE_LEARNING } from "./lib/featureFlags";
import { getSessionId, getConsent } from "./lib/storage";

import { WelcomePage } from "./pages/user/WelcomePage";
import { UserStartPage } from "./pages/user/UserStartPage";
import { UserPhaseManualPage } from "./pages/user/UserPhaseManualPage";
import { UserNormalLlmPage } from "./pages/user/UserNormalLlmPage";
import { UserActiveManualPage } from "./pages/user/UserActiveManualPage";
import { UserActiveLlmPage } from "./pages/user/UserActiveLlmPage";
import { UserVisualizationPage } from "./pages/user/UserVisualizationPage";
import { UserSurveyPage } from "./pages/user/UserSurveyPage";
import { SharePage } from "./pages/share/SharePage";

import { AdminConfigPage as V1AdminConfigPage } from "./pages/admin/AdminConfigPage";
import { AdminDashboardNormalPage } from "./pages/admin/AdminDashboardNormalPage";
import { AdminDashboardOverallPage } from "./pages/admin/AdminDashboardOverallPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminUnitsPage } from "./pages/admin/AdminUnitsPage";
import { AdminOpsPage } from "./pages/admin/AdminOpsPage";

const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import("./pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const ProjectListPage = lazy(() => import("./pages/projects/ProjectListPage").then((m) => ({ default: m.ProjectListPage })));
const ProjectDetailPage = lazy(() => import("./pages/projects/ProjectDetailPage").then((m) => ({ default: m.ProjectDetailPage })));
const CreateProjectPage = lazy(() => import("./pages/projects/CreateProjectPage").then((m) => ({ default: m.CreateProjectPage })));
const ProjectSettingsPage = lazy(() => import("./pages/projects/ProjectSettingsPage").then((m) => ({ default: m.ProjectSettingsPage })));
const LabelingPage = lazy(() => import("./pages/labeling/LabelingPage").then((m) => ({ default: m.LabelingPage })));
const LlmLabelingPage = lazy(() => import("./pages/labeling/LlmLabelingPage").then((m) => ({ default: m.LlmLabelingPage })));
const ConflictResolutionPage = lazy(() => import("./pages/labeling/ConflictResolutionPage").then((m) => ({ default: m.ConflictResolutionPage })));
const V2WelcomePage = lazy(() => import("./pages/labeling/WelcomePage").then((m) => ({ default: m.WelcomePage })));
const SurveyPage = lazy(() => import("./pages/labeling/SurveyPage").then((m) => ({ default: m.SurveyPage })));
const IrrAnalysisPage = lazy(() => import("./pages/analysis/IrrAnalysisPage").then((m) => ({ default: m.IrrAnalysisPage })));
const VisualizationPage = lazy(() => import("./pages/analysis/VisualizationPage").then((m) => ({ default: m.VisualizationPage })));
const ExportPage = lazy(() => import("./pages/analysis/ExportPage").then((m) => ({ default: m.ExportPage })));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage").then((m) => ({ default: m.AdminDashboardPage })));
const ProductivityPage = lazy(() => import("./pages/analysis/ProductivityPage").then((m) => ({ default: m.ProductivityPage })));
const DataItemsListPage = lazy(() => import("./pages/projects/DataItemsListPage").then((m) => ({ default: m.DataItemsListPage })));

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" className="btn sm" onClick={toggle} aria-label={theme === "dark" ? "Light mode" : "Dark mode"}>
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

function sanitizePageUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const sensitiveKeys = ["token", "session_id", "sessionId", "auth", "authorization"];
    for (const key of sensitiveKeys) {
      if (u.searchParams.has(key)) u.searchParams.set(key, "***");
    }
    return u.toString();
  } catch {
    return raw
      .replace(/([?&](?:token|session_id|sessionId|auth|authorization)=)[^&]*/gi, "$1***");
  }
}

function App() {
  const location = useLocation();
  const pathnameRef = useRef<string | null>(null);
  const routeContext = location.pathname.startsWith("/user/")
    ? "V1 Labeling Flow"
    : location.pathname.startsWith("/projects/")
      ? "V2 Project Workspace"
      : "MNotation";

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!getConsent()) return;
      api.reportClientError({
        message: event.message || "window_error",
        stack: event.error?.stack,
        page: sanitizePageUrl(window.location.href)
      }).catch(() => undefined);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (!getConsent()) return;
      const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      api.reportClientError({
        message: `unhandled_rejection: ${reason.message}`,
        stack: reason.stack,
        page: sanitizePageUrl(window.location.href)
      }).catch(() => undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);

  useEffect(() => {
    const sessionId = getSessionId();
    const path = location.pathname;
    if (!sessionId || !path || !getConsent()) return;
    const entered = Date.now();
    pathnameRef.current = path;
    api.recordPageViewEnter(sessionId, path, entered).catch(() => undefined);
    return () => {
      if (pathnameRef.current) {
        api.recordPageViewLeave(sessionId, pathnameRef.current, Date.now()).catch(() => undefined);
        pathnameRef.current = null;
      }
    };
  }, [location.pathname]);

  return (
    <>
      {/* Top Nav — V2 style */}
      <nav className="top-nav">
        <Link to="/" className="top-nav-logo">MNotation</Link>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginRight: 8 }}>{routeContext}</span>
        <ThemeToggle />
        <LanguageSwitcher />
      </nav>
      <CommandPalette />

      <Suspense
        fallback={
          <div className="page">
            <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>
              <span className="spinner" aria-label="loading" />
            </div>
          </div>
        }
      >
      <Routes>
        {/* ─── V1 User routes (original labeling tool) ─────────────── */}
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/user/start" element={<UserStartPage />} />
        <Route path="/user/normal/manual" element={<UserPhaseManualPage phase="normal" />} />
        <Route path="/user/normal/llm" element={<UserNormalLlmPage />} />
        <Route path="/user/visualization" element={<UserVisualizationPage />} />
        {ENABLE_ACTIVE_LEARNING && (
          <>
            <Route path="/user/active/manual" element={<UserActiveManualPage />} />
            <Route path="/user/active/llm" element={<UserActiveLlmPage />} />
          </>
        )}
        <Route path="/user/survey" element={<UserSurveyPage />} />

        {/* ─── V1 Admin routes ─────────────────────────────────────── */}
        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/dashboard" element={<AdminGuard><AdminDashboardNormalPage /></AdminGuard>} />
        <Route path="/admin/dashboard/normal" element={<AdminGuard><AdminDashboardNormalPage /></AdminGuard>} />
        <Route path="/admin/dashboard/overall" element={<AdminGuard><AdminDashboardOverallPage /></AdminGuard>} />
        <Route path="/admin/config" element={<AdminGuard><V1AdminConfigPage /></AdminGuard>} />
        <Route path="/admin/units" element={<AdminGuard><AdminUnitsPage /></AdminGuard>} />
        <Route path="/admin/ops" element={<AdminGuard><AdminOpsPage /></AdminGuard>} />

        {/* ─── V1 Share route ─────────────────────────────────────── */}
        <Route path="/share/:token" element={<SharePage />} />

        {/* ─── V2 Project routes (new multi-project features) ─────── */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/projects/new" element={<CreateProjectPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
        <Route path="/projects/:projectId/welcome" element={<V2WelcomePage />} />
        <Route path="/projects/:projectId/label" element={<LabelingPage />} />
        <Route path="/projects/:projectId/llm" element={<LlmLabelingPage />} />
        <Route path="/projects/:projectId/conflicts" element={<ConflictResolutionPage />} />
        <Route path="/projects/:projectId/visualization" element={<VisualizationPage />} />
        <Route path="/projects/:projectId/survey" element={<SurveyPage />} />
        <Route path="/projects/:projectId/irr" element={<IrrAnalysisPage />} />
        <Route path="/projects/:projectId/export" element={<ExportPage />} />
        <Route path="/projects/:projectId/productivity" element={<ProductivityPage />} />
        <Route path="/projects/:projectId/data-items" element={<DataItemsListPage />} />
        <Route path="/projects/:projectId/admin" element={<AdminDashboardPage />} />
        <Route path="/projects/:projectId/admin/config" element={<V1AdminConfigPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}

export default App;
