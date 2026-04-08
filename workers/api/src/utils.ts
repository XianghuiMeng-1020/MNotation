import type { Context } from "hono";

export function nowIso() {
  return new Date().toISOString();
}

export function json(c: Context, data: unknown, status = 200) {
  return c.json(data as any, status as any);
}

export function uid(prefix = "") {
  return `${prefix}${crypto.randomUUID()}`;
}

export function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
