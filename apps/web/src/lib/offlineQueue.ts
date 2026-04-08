type QueueItem = { kind: "submit"; projectId: string; payload: unknown };
const KEY = "mnotation_offline_queue";

function loadQueue(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveQueue(items: QueueItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 200)));
}

export function enqueueOffline(item: QueueItem) {
  const q = loadQueue();
  q.push(item);
  saveQueue(q);
}

export function getOfflineCount() {
  return loadQueue().length;
}

export function clearOfflineQueue() {
  saveQueue([]);
}
