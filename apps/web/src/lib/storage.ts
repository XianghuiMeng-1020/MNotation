const PREFIX = "mnotation_";

export const storage = {
  get: (key: string) => localStorage.getItem(PREFIX + key),
  set: (key: string, value: string) => localStorage.setItem(PREFIX + key, value),
  remove: (key: string) => localStorage.removeItem(PREFIX + key),
};

export function getProjectId() {
  return localStorage.getItem(`${PREFIX}project_id`) ?? "";
}

export function setProjectId(projectId: string) {
  localStorage.setItem(`${PREFIX}project_id`, projectId);
}

export function clearProjectId() {
  localStorage.removeItem(`${PREFIX}project_id`);
}
