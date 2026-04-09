import { api, type AttemptPayload } from "./api";

const QUEUE_KEY = "mnotation_offline_manual_queue_v1";
const DEAD_KEY = "mnotation_offline_dead_letter_v1";

export type ManualQueueItem = {
  session_id: string;
  unit_id: string;
  phase: string;
  label: string;
  attempt: AttemptPayload;
};

function readQueue(): ManualQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: ManualQueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

function readDead(): ManualQueueItem[] {
  try {
    const raw = localStorage.getItem(DEAD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeDead(items: ManualQueueItem[]) {
  localStorage.setItem(DEAD_KEY, JSON.stringify(items));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("deadLetterChange"));
}

export function enqueueManualSubmission(item: ManualQueueItem) {
  const q = readQueue();
  q.push(item);
  writeQueue(q);
}

export async function flushOfflineQueue(): Promise<{ synced: number; pending: number }> {
  const q = readQueue();
  if (q.length === 0) return { synced: 0, pending: 0 };
  let synced = 0;
  const pending: ManualQueueItem[] = [];
  for (const item of q) {
    try {
      await api.submitManual(item);
      synced++;
    } catch (e: any) {
      const status = Number(e?.status ?? 0);
      if (status === 400) {
        const dead = readDead();
        dead.push(item);
        writeDead(dead);
      } else {
        pending.push(item);
      }
    }
  }
  writeQueue(pending);
  return { synced, pending: pending.length };
}

export function getDeadLetterCount(): number {
  return readDead().length;
}

export function clearDeadLetter() {
  localStorage.removeItem(DEAD_KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("deadLetterChange"));
}

/** V3: optional generic queue for future project flows */
export function enqueueOfflineSubmit(entry: { projectId: string; body: unknown; at: number }) {
  try {
    const raw = localStorage.getItem("mnotation_v3_offline");
    const list: Array<{ projectId: string; body: unknown; at: number }> = raw ? JSON.parse(raw) : [];
    list.push(entry);
    localStorage.setItem("mnotation_v3_offline", JSON.stringify(list.slice(-200)));
  } catch {
    /* quota */
  }
}

export function peekOfflineQueue(): Array<{ projectId: string; body: unknown; at: number }> {
  try {
    const raw = localStorage.getItem("mnotation_v3_offline");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearOfflineQueueV3() {
  try {
    localStorage.removeItem("mnotation_v3_offline");
  } catch {
    /* */
  }
}
