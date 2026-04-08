import { Navigate, Route, Routes } from "react-router-dom";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { LoginPage } from "./pages/auth/LoginPage";
import { ProjectListPage } from "./pages/projects/ProjectListPage";
import { ProjectDetailPage } from "./pages/projects/ProjectDetailPage";
import { CreateProjectPage } from "./pages/projects/CreateProjectPage";
import { ProjectSettingsPage } from "./pages/projects/ProjectSettingsPage";
import { LabelingPage } from "./pages/labeling/LabelingPage";
import { LlmLabelingPage } from "./pages/labeling/LlmLabelingPage";
import { ConflictResolutionPage } from "./pages/labeling/ConflictResolutionPage";
import { WelcomePage } from "./pages/labeling/WelcomePage";
import { SurveyPage } from "./pages/labeling/SurveyPage";
import { IrrAnalysisPage } from "./pages/analysis/IrrAnalysisPage";
import { VisualizationPage } from "./pages/analysis/VisualizationPage";
import { ExportPage } from "./pages/analysis/ExportPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminConfigPage } from "./pages/admin/AdminConfigPage";

export default function App() {
  return (
    <>
      <nav style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "var(--surface)",
        borderBottom: "1px solid var(--border-color)",
        padding: "0 1.25rem",
        height: "52px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backdropFilter: "blur(8px)"
      }}>
        <a href="/projects" style={{ fontWeight: 700, fontSize: "1.1rem", textDecoration: "none", color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          MNotation
        </a>
        <LanguageSwitcher />
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/projects/new" element={<CreateProjectPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
        <Route path="/projects/:projectId/welcome" element={<WelcomePage />} />
        <Route path="/projects/:projectId/label" element={<LabelingPage />} />
        <Route path="/projects/:projectId/llm" element={<LlmLabelingPage />} />
        <Route path="/projects/:projectId/conflicts" element={<ConflictResolutionPage />} />
        <Route path="/projects/:projectId/visualization" element={<VisualizationPage />} />
        <Route path="/projects/:projectId/survey" element={<SurveyPage />} />
        <Route path="/projects/:projectId/irr" element={<IrrAnalysisPage />} />
        <Route path="/projects/:projectId/export" element={<ExportPage />} />
        <Route path="/projects/:projectId/admin" element={<AdminDashboardPage />} />
        <Route path="/projects/:projectId/admin/config" element={<AdminConfigPage />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </>
  );
}
