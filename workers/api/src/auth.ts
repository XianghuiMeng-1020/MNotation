import type { Context, MiddlewareHandler } from "hono";
import type { Env, UserIdentity } from "./types";
import { json, nowIso } from "./utils";

function decodeJwtPayload(token: string): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replaceAll("-", "+").replaceAll("_", "/")));
    return payload;
  } catch {
    return null;
  }
}

function extractIdentity(c: Context<{ Bindings: Env }>): UserIdentity | null {
  const jwt = c.req.header("Cf-Access-Jwt-Assertion");
  if (!jwt) return null;
  const payload = decodeJwtPayload(jwt);
  if (!payload) return null;
  const email = String(payload.email ?? "");
  const sub = String(payload.sub ?? email);
  if (!email) return null;
  return {
    userId: sub,
    email,
    displayName: String(payload.name ?? email.split("@")[0] ?? "user")
  };
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const identity = extractIdentity(c);
  if (!identity) return json(c, { error: "unauthorized" }, 401);
  (c as any).set("user", identity);
  await c.env.DB.prepare(
    "INSERT INTO users(user_id, email, display_name, created_at, last_active_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name, last_active_at=excluded.last_active_at"
  ).bind(identity.userId, identity.email, identity.displayName, nowIso(), nowIso()).run();
  await next();
};

export function getUser(c: Context): UserIdentity {
  return (c as any).get("user");
}
