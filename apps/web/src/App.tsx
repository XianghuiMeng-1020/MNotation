import { useEffect, useRef } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import { AdminGuard } from "./components/AdminGuard";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
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

import { LoginPage } from "./pages/auth/LoginPage";
import { ProjectListPage } from "./pages/projects/ProjectListPage";
import { ProjectDetailPage } from "./pages/projects/ProjectDetailPage";
import { CreateProjectPage } from "./pages/projects/CreateProjectPage";
import { ProjectSettingsPage } from "./pages/projects/ProjectSettingsPage";
import { LabelingPage } from "./pages/labeling/LabelingPage";
import { LlmLabelingPage } from "./pages/labeling/LlmLabelingPage";
import { ConflictResolutionPage } from "./pages/labeling/ConflictResolutionPage";
import { WelcomePage as V2WelcomePage } from "./pages/labeling/WelcomePage";
import { SurveyPage } from "./pages/labeling/SurveyPage";
import { IrrAnalysisPage } from "./pages/analysis/IrrAnalysisPage";
import { VisualizationPage } from "./pages/analysis/VisualizationPage";
import { ExportPage } from "./pages/analysis/ExportPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";

function App() {
  const location = useLocation();
  const pathnameRef = useRef<string | null>(null);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!getConsent()) return;
      api.reportClientError({ message: event.message || "window_error", stack: event.error?.stack, page: window.location.href }).catch(() => undefined);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (!getConsent()) return;
      const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      api.reportClientError({ message: `unhandled_rejection: ${reason.message}`, stack: reason.stack, page: window.location.href }).catch(() => undefined);
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
        <Link to="/projects" className="top-nav-logo">MNotation</Link>
        <LanguageSwitcher />
      </nav>

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
        <Route path="/" element={<Navigate to="/projects" replace />} />
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
        <Route path="/projects/:projectId/admin" element={<AdminDashboardPage />} />
        <Route path="/projects/:projectId/admin/config" element={<V1AdminConfigPage />} />

        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </>
  );
}

export default App;
