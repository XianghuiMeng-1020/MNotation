import { getAdminToken } from "./storage";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export type Phase = "normal" | "active" | "conflict_resolution";
export type Task = "manual" | "llm";
export type LlmMode = "prompt1" | "prompt2" | "custom";

export type AttemptPayload = {
  shown_at_epoch_ms: number;
  answered_at_epoch_ms: number;
  active_ms: number;
  hidden_ms: number;
  idle_ms: number;
  hidden_count: number;
  blur_count: number;
  had_background: number;
  events: Array<{ t_perf_ms: number; t_epoch_ms: number; type: string; payload_json?: string }>;
};

function adminHeaders(token?: string, extra?: HeadersInit) {
  const resolved = token || getAdminToken();
  return { ...(extra ?? {}), ...(resolved ? { Authorization: `Bearer ${resolved}` } : {}) } as HeadersInit;
}

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (email: string, name?: string) => req("/api/auth/login", { method: "POST", body: JSON.stringify({ email, name }) }),
  me: () => req("/api/auth/me"),
  logout: () => req("/api/auth/logout", { method: "POST" }),

  createProject: (body: unknown) => req("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  getProjects: () => req("/api/projects"),
  getProject: (id: string) => req(`/api/projects/${id}`),
  updateProject: (id: string, body: unknown) => req(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProject: (id: string) => req(`/api/projects/${id}`, { method: "DELETE" }),

  addMember: (id: string, body: unknown) => req(`/api/projects/${id}/members`, { method: "POST", body: JSON.stringify(body) }),
  removeMember: (id: string, userId: string) => req(`/api/projects/${id}/members/${userId}`, { method: "DELETE" }),
  getMembers: (id: string) => req(`/api/projects/${id}/members`),

  uploadDataset: (id: string, body: unknown) => req(`/api/projects/${id}/datasets/upload`, { method: "POST", body: JSON.stringify(body) }),
  previewDataset: (id: string, datasetId: string) => req(`/api/projects/${id}/datasets/${datasetId}/preview`, { method: "POST" }),
  configureDataset: (id: string, datasetId: string, body: unknown) => req(`/api/projects/${id}/datasets/${datasetId}/configure`, { method: "POST", body: JSON.stringify(body) }),
  processDataset: (id: string, datasetId: string) => req(`/api/projects/${id}/datasets/${datasetId}/process`, { method: "POST" }),
  getDatasets: (id: string) => req(`/api/projects/${id}/datasets`),
  getDataItems: (id: string) => req(`/api/projects/${id}/data-items`),
  getDataItem: (id: string, itemId: string) => req(`/api/projects/${id}/data-items/${itemId}`),

  getCodingScheme: (id: string) => req(`/api/projects/${id}/coding-scheme`),
  setCodingScheme: (id: string, body: unknown) => req(`/api/projects/${id}/coding-scheme`, { method: "POST", body: JSON.stringify(body) }),
  getCodingSchemeHistory: (id: string) => req(`/api/projects/${id}/coding-scheme/history`),

  generateAssignments: (id: string) => req(`/api/projects/${id}/assignments/generate`, { method: "POST" }),
  getMyAssignments: (id: string) => req(`/api/projects/${id}/assignments/my`),
  getAssignmentProgress: (id: string) => req(`/api/projects/${id}/assignments/progress`),

  nextLabelItem: (id: string, phase: Phase, task: Task) => req(`/api/projects/${id}/labeling/next?phase=${phase}&task=${task}`),
  submitLabel: (id: string, body: unknown) => req(`/api/projects/${id}/labeling/submit`, { method: "POST", body: JSON.stringify(body) }),
  undoLabel: (id: string, body: unknown) => req(`/api/projects/${id}/labeling/undo`, { method: "POST", body: JSON.stringify(body) }),
  getLabelItem: (id: string, itemId: string) => req(`/api/projects/${id}/labeling/item/${itemId}`),
  getLabelComparison: (id: string, itemId: string) => req(`/api/projects/${id}/labeling/item/${itemId}/comparison`),

  runProjectLlm: (id: string, body: unknown) => req(`/api/projects/${id}/llm/run`, { method: "POST", body: JSON.stringify(body) }),
  runLlmBatch: (id: string, body: unknown) => req(`/api/projects/${id}/llm/run-batch`, { method: "POST", body: JSON.stringify(body) }),
  acceptProjectLlm: (id: string, body: unknown) => req(`/api/projects/${id}/llm/accept`, { method: "POST", body: JSON.stringify(body) }),
  getProjectCustomCount: (id: string, itemId: string) => req(`/api/projects/${id}/llm/custom/count?item_id=${itemId}`),
  pingLlm: () => req("/api/llm/ping", { method: "POST" }),

  getProjectPrompts: (id: string) => req(`/api/projects/${id}/prompts`),
  setProjectPrompts: (id: string, body: unknown) => req(`/api/projects/${id}/prompts`, { method: "POST", body: JSON.stringify(body) }),

  runAl: (id: string) => req(`/api/projects/${id}/al/run`, { method: "POST" }),
  getAlStatus: (id: string, runId: string) => req(`/api/projects/${id}/al/status?run_id=${runId}`),
  ensureAlAssignments: (id: string) => req(`/api/projects/${id}/al/ensure-assignments`, { method: "POST" }),
  getAlScores: (id: string) => req(`/api/projects/${id}/al/scores`),

  calculateIrr: (id: string) => req(`/api/projects/${id}/irr/calculate`, { method: "POST" }),
  getLatestIrr: (id: string) => req(`/api/projects/${id}/irr/latest`),
  getIrrHistory: (id: string) => req(`/api/projects/${id}/irr/history`),
  getIrrPerCategory: (id: string) => req(`/api/projects/${id}/irr/per-category`),
  getIrrPairwise: (id: string) => req(`/api/projects/${id}/irr/pairwise`),
  getIrrConfusion: (id: string) => req(`/api/projects/${id}/irr/confusion-matrix`),
  aiSuggestIrr: (id: string) => req(`/api/projects/${id}/irr/ai-suggest`, { method: "POST" }),

  getConflicts: (id: string) => req(`/api/projects/${id}/conflicts`),
  getConflict: (id: string, conflictId: string) => req(`/api/projects/${id}/conflicts/${conflictId}`),
  detectConflicts: (id: string) => req(`/api/projects/${id}/conflicts/detect`, { method: "POST" }),
  resolveConflict: (id: string, conflictId: string, body: unknown) => req(`/api/projects/${id}/conflicts/${conflictId}/resolve`, { method: "POST", body: JSON.stringify(body) }),
  reopenConflict: (id: string, conflictId: string) => req(`/api/projects/${id}/conflicts/${conflictId}/reopen`, { method: "POST" }),

  getMessages: (id: string) => req(`/api/projects/${id}/messages`),
  getItemMessages: (id: string, itemId: string) => req(`/api/projects/${id}/messages/item/${itemId}`),
  getConflictMessages: (id: string, conflictId: string) => req(`/api/projects/${id}/messages/conflict/${conflictId}`),
  postMessage: (id: string, body: unknown) => req(`/api/projects/${id}/messages`, { method: "POST", body: JSON.stringify(body) }),

  getNotifications: (id: string) => req(`/api/projects/${id}/notifications`),
  markNotificationsRead: (id: string, body: unknown) => req(`/api/projects/${id}/notifications/read`, { method: "POST", body: JSON.stringify(body) }),

  getStatsOverview: (id: string) => req(`/api/projects/${id}/stats/overview`),
  getStatsPerMember: (id: string) => req(`/api/projects/${id}/stats/per-member`),
  getLabelDistribution: (id: string) => req(`/api/projects/${id}/stats/label-distribution`),
  getTimeAnalysis: (id: string) => req(`/api/projects/${id}/stats/time-analysis`),
  exportData: (id: string, format: "csv" | "json" | "xlsx") => req(`/api/projects/${id}/export?format=${format}`),

  getSurveyResponse: (id: string) => req(`/api/projects/${id}/survey/my`),
  submitProjectSurvey: (id: string, body: unknown) => req(`/api/projects/${id}/survey/submit`, { method: "POST", body: JSON.stringify(body) }),
  getSurveyAll: (id: string) => req(`/api/projects/${id}/survey/all`),

  getVizStats: (id: string) => req(`/api/projects/${id}/viz/stats`),

  health: () => req("/api/health"),

  // ─── V1 API methods (session-based, for V1 pages) ──────────────────────
  getTaxonomy: () => req("/api/taxonomy"),
  getPrompts: () => req("/api/prompts"),
  startSession: (payload: { user_id?: string; normal_n?: number; active_m?: number; has_consent?: boolean }) =>
    req("/api/session/start", { method: "POST", body: JSON.stringify(payload) }),
  resetSession: (payload: { session_id: string; reset_token?: string }) =>
    req("/api/session/reset", { method: "POST", body: JSON.stringify(payload) }),
  getSessionStatus: (sessionId: string) =>
    req(`/api/session/status?session_id=${encodeURIComponent(sessionId)}`),
  getNextUnit: (sessionId: string, phase: string, task: string) =>
    req(`/api/units/next?session_id=${encodeURIComponent(sessionId)}&phase=${phase}&task=${task}`),
  getActiveLlmResults: (sessionId: string) =>
    req(`/api/active/llm/results?session_id=${encodeURIComponent(sessionId)}`),
  ensureActiveLlmResults: (sessionId: string) =>
    req(`/api/active/llm/ensure?session_id=${encodeURIComponent(sessionId)}`, { method: "POST" }),
  ensureActiveAssignments: (sessionId: string) =>
    req("/api/active/ensure-assignments", { method: "POST", body: JSON.stringify({ session_id: sessionId }) }) as Promise<{ ok: boolean; status: string; detail?: string }>,
  submitManual: (payload: { session_id: string; unit_id: string; phase: string; label: string; attempt: AttemptPayload; idempotency_key?: string }) =>
    req("/api/labels/manual", { method: "POST", body: JSON.stringify(payload) }),
  undoManual: (payload: { session_id: string; unit_id: string; phase: string }) =>
    req("/api/labels/undo", { method: "POST", body: JSON.stringify(payload) }),
  runLlmEssay: (payload: { session_id: string; essay_index: number; mode?: LlmMode; custom_prompt_text?: string }) =>
    req("/api/llm/run-essay", { method: "POST", body: JSON.stringify(payload) }) as Promise<{ results: Array<{ unit_id: string; predicted_label: string }> }>,
  runLlm: (payload: { session_id: string; unit_id: string; phase: "normal"; mode: LlmMode; custom_prompt_text?: string }) =>
    req("/api/llm/run", { method: "POST", body: JSON.stringify(payload) }),
  acceptLlm: (payload: { session_id: string; unit_id: string; phase: "normal"; mode: LlmMode; accepted_label: string; attempt: AttemptPayload; idempotency_key?: string }) =>
    req("/api/llm/accept", { method: "POST", body: JSON.stringify(payload) }),
  acceptV1Llm: (payload: { session_id: string; unit_id: string; phase: "normal"; mode: LlmMode; accepted_label: string; attempt: AttemptPayload; idempotency_key?: string }) =>
    req("/api/llm/accept", { method: "POST", body: JSON.stringify(payload) }),
  getCustomCount: (sessionId: string, unitId: string, phase: string) =>
    req(`/api/llm/custom/count?session_id=${encodeURIComponent(sessionId)}&unit_id=${encodeURIComponent(unitId)}&phase=${phase}`) as Promise<{ count: number; max: number; exhausted: boolean }>,
  submitRanking: (payload: { session_id: string; essay_index: number; ordering: string[] }) =>
    req("/api/ranking/submit", { method: "POST", body: JSON.stringify(payload) }),
  submitSurvey: (payload: { session_id: string; likert: Record<string, number>; mc_q11: string; open_q12: string; open_q13: string; open_q14: string }) =>
    req("/api/survey/submit", { method: "POST", body: JSON.stringify(payload) }),
  getRankingStatus: (sessionId: string) =>
    req(`/api/ranking/status?session_id=${encodeURIComponent(sessionId)}`) as Promise<{ ranked_essays: number[] }>,
  reopenEssayForLabeling: (payload: { session_id: string; essay_index: number }) =>
    req("/api/ranking/reopen", { method: "POST", body: JSON.stringify(payload) }),
  undoRanking: (payload: { session_id: string; essay_index: number }) =>
    req("/api/ranking/undo", { method: "POST", body: JSON.stringify(payload) }),
  getEssayLabels: (sessionId: string, essayIndex: number, phase: string = "normal") =>
    req(`/api/essay-labels?session_id=${encodeURIComponent(sessionId)}&essay_index=${essayIndex}&phase=${phase}`) as Promise<{ essay_index: number; sentences: Array<{ unit_id: string; text: string; manual_label: string | null; llm_label: string | null; al_reason?: string | null; al_score?: number | null }> }>,
  getLabeledEssays: (sessionId: string, phase: string = "normal") =>
    req(`/api/session/labeled-essays?session_id=${encodeURIComponent(sessionId)}&phase=${phase}`) as Promise<{ fully_labeled_essays: number[] }>,
  recordPageViewEnter: (sessionId: string, pagePath: string, enteredAtEpochMs: number) =>
    req("/api/page-view/enter", { method: "POST", body: JSON.stringify({ session_id: sessionId, page_path: pagePath, entered_at_epoch_ms: enteredAtEpochMs }) }),
  recordPageViewLeave: (sessionId: string, pagePath: string, leftAtEpochMs: number) =>
    req("/api/page-view/leave", { method: "POST", body: JSON.stringify({ session_id: sessionId, page_path: pagePath, left_at_epoch_ms: leftAtEpochMs }) }),
  getLabelDifference: (sessionId: string) =>
    req(`/api/stats/label-difference?session_id=${encodeURIComponent(sessionId)}`) as Promise<{ essays: Array<{ essay_index: number; sentences: Array<{ unit_id: string; text: string; human_label: string; llm_label: string; diff: boolean }> }> }>,
  getInformativeness: () =>
    req("/api/stats/informativeness") as Promise<{ essays: Array<{ essay_index: number; avg_score: number; count: number }> }>,
  getVisualizationStats: () =>
    req("/api/stats/visualization") as Promise<{ label_distribution: { normal_manual: Record<string, number>; normal_llm: Record<string, number> }; time_comparison: { sentence_avg: { manual_ms: number; llm_ms: number }; essay_avg: { manual_ms: number; llm_ms: number }; total_avg: { manual_ms: number; llm_ms: number } }; meta: { sessions: number; sentences_per_essay: number; total_essays: number } }>,
  getPhaseLocks: () =>
    req("/api/phase-locks") as Promise<{ lock_manual: boolean; lock_llm: boolean; lock_active: boolean; lock_survey: boolean }>,
  // V1 Admin
  adminLogin: (adminToken: string) =>
    req("/api/admin/auth/login", { method: "POST", body: JSON.stringify({ admin_token: adminToken }) }) as Promise<{ token: string; expires_at_epoch_ms: number }>,
  adminVerify: (token?: string) => req("/api/admin/auth/verify", { headers: adminHeaders(token) }) as Promise<{ ok: boolean }>,
  adminGetNormalStats: (token?: string) => req("/api/admin/stats/normal", { headers: adminHeaders(token) }),
  adminGetOverallStats: (token?: string) => req("/api/admin/stats/overall", { headers: adminHeaders(token) }),
  adminGetStatsSync: (token?: string) => req("/api/admin/stats/sync", { headers: adminHeaders(token) }),
  adminGetOpsRecent: (token?: string, limit?: number) => req(`/api/admin/ops/recent?limit=${limit ?? 50}`, { headers: adminHeaders(token) }),
  adminGetOpsSession: (sessionId: string, token?: string) => req(`/api/admin/ops/session/${sessionId}`, { headers: adminHeaders(token) }),
  adminGetQwenMetrics: (token?: string) => req("/api/admin/ops/qwen_metrics", { headers: adminHeaders(token) }),
  adminGetAuditConsistency: (token?: string) => req("/api/admin/audit/consistency", { headers: adminHeaders(token) }),
  adminGetBehavior: (token?: string) => req("/api/admin/behavior", { headers: adminHeaders(token) }),
  adminGetSessions: (token?: string) => req("/api/admin/sessions", { headers: adminHeaders(token) }),
  adminGetSessionConfig: (token?: string) => req("/api/admin/config/session", { headers: adminHeaders(token) }),
  adminSetSessionConfig: (config: { normal_n?: number; active_m?: number }, token?: string) =>
    req("/api/admin/config/session", { method: "POST", headers: adminHeaders(token, { "Content-Type": "application/json" }), body: JSON.stringify(config) }),
  adminSetTaxonomy: (labels: Array<{ label: string; description?: string }>, token?: string) =>
    req("/api/admin/taxonomy/set", { method: "POST", headers: adminHeaders(token, { "Content-Type": "application/json" }), body: JSON.stringify({ labels }) }),
  adminSetPrompts: (prompt1: string, prompt2: string, token?: string) =>
    req("/api/admin/prompts/set", { method: "POST", headers: adminHeaders(token, { "Content-Type": "application/json" }), body: JSON.stringify({ prompt1, prompt2 }) }),
  adminImportUnits: (units: Array<{ unit_id: string; text: string; meta_json?: string }>, token?: string) =>
    req("/api/admin/units/import", { method: "POST", headers: adminHeaders(token, { "Content-Type": "application/json" }), body: JSON.stringify({ units }) }),
  adminRunAl: (candidate_k: number, active_m: number, params?: { top_h?: number; sample_n?: number; temperature?: number; seed?: number }, token?: string) =>
    req("/api/admin/al/run", { method: "POST", headers: adminHeaders(token, { "Content-Type": "application/json" }), body: JSON.stringify({ candidate_k, active_m, active_llm_n: active_m, ...params }) }),
  adminGetAlStatus: (run_id: string, token?: string) => req(`/api/admin/al/status?run_id=${encodeURIComponent(run_id)}`, { headers: adminHeaders(token) }),
  adminSetPhaseLocks: (locks: { lock_manual?: boolean; lock_llm?: boolean; lock_active?: boolean; lock_survey?: boolean }, token?: string) =>
    req("/api/admin/phase-locks/set", { method: "POST", headers: adminHeaders(token, { "Content-Type": "application/json" }), body: JSON.stringify(locks) }),
  adminCreateShare: (token?: string) => req("/api/admin/share/create", { method: "POST", headers: adminHeaders(token) }),
  adminExport: async (format: "jsonl" | "csv", token?: string): Promise<{ blob: Blob; meta?: { count: number; truncated?: boolean; hint?: string } }> => {
    const r = await fetch(`${API_BASE}/api/admin/export?format=${format}`, { headers: adminHeaders(token), credentials: "include" });
    if (!r.ok) { const d = await r.json().catch(() => ({})); const e: any = new Error((d as any)?.error ?? "Export failed"); e.status = r.status; throw e; }
    const mh = r.headers.get("X-Export-Meta");
    let meta: { count: number; truncated?: boolean; hint?: string } | undefined;
    if (mh) { try { const p = JSON.parse(mh); if (typeof p.count === "number") meta = p; } catch { /* */ } }
    return { blob: await r.blob(), meta };
  },
  shareStats: (token: string) => req(`/api/share/stats?token=${encodeURIComponent(token)}`),
  reportClientError: (payload: { message: string; stack?: string; page?: string; extra?: unknown }) =>
    req("/api/client/errors", { method: "POST", body: JSON.stringify(payload) }),
};
