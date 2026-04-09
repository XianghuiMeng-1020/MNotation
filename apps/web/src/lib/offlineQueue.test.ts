import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { clearDeadLetter, enqueueManualSubmission, flushOfflineQueue, getDeadLetterCount } from "./offlineQueue";

const baseAttempt = {
  shown_at_epoch_ms: Date.now() - 1000,
  answered_at_epoch_ms: Date.now(),
  active_ms: 500,
  hidden_ms: 0,
  idle_ms: 0,
  hidden_count: 0,
  blur_count: 0,
  had_background: 0,
  events: []
};

describe("offlineQueue", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); }
      }
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: { dispatchEvent: () => true }
    });
    clearDeadLetter();
    vi.restoreAllMocks();
  });

  it("flushes queued manual submissions", async () => {
    vi.spyOn(api, "submitManual").mockResolvedValue({ ok: true } as any);
    enqueueManualSubmission({
      session_id: "s1",
      unit_id: "u1",
      phase: "normal",
      label: "CODE",
      attempt: baseAttempt
    });
    const out = await flushOfflineQueue();
    expect(out.synced).toBe(1);
    expect(out.pending).toBe(0);
  });

  it("sends non-retryable failures to dead-letter", async () => {
    vi.spyOn(api, "submitManual").mockRejectedValue({ status: 400, message: "bad request" });
    enqueueManualSubmission({
      session_id: "s1",
      unit_id: "u2",
      phase: "normal",
      label: "CODE",
      attempt: baseAttempt
    });
    const out = await flushOfflineQueue();
    expect(out.synced).toBe(0);
    expect(out.pending).toBe(0);
    expect(getDeadLetterCount()).toBe(1);
  });
});
