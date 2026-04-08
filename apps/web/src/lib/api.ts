export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export type Phase = "normal" | "active" | "conflict_resolution";
export type Task = "manual" | "llm";
export type LlmMode = "prompt1" | "prompt2" | "custom";

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
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

  runLlm: (id: string, body: unknown) => req(`/api/projects/${id}/llm/run`, { method: "POST", body: JSON.stringify(body) }),
  runLlmBatch: (id: string, body: unknown) => req(`/api/projects/${id}/llm/run-batch`, { method: "POST", body: JSON.stringify(body) }),
  acceptLlm: (id: string, body: unknown) => req(`/api/projects/${id}/llm/accept`, { method: "POST", body: JSON.stringify(body) }),
  getCustomCount: (id: string, itemId: string) => req(`/api/projects/${id}/llm/custom/count?item_id=${itemId}`),
  pingLlm: () => req("/api/llm/ping", { method: "POST" }),

  getPrompts: (id: string) => req(`/api/projects/${id}/prompts`),
  setPrompts: (id: string, body: unknown) => req(`/api/projects/${id}/prompts`, { method: "POST", body: JSON.stringify(body) }),

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

  health: () => req("/api/health")
};
