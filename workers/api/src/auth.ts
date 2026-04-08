import type { Context, MiddlewareHandler } from "hono";
import type { Env, UserIdentity } from "./types";
import { json, nowIso } from "./utils";

function decodeJwtPayload(token: string): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(atob(parts[1].replaceAll("-", "+").replaceAll("_", "/")));
  } catch {
    return null;
  }
}

function extractIdentity(c: Context<{ Bindings: Env }>): UserIdentity | null {
  // 1) Cloudflare Access JWT (production)
  const jwt = c.req.header("Cf-Access-Jwt-Assertion");
  if (jwt) {
    const payload = decodeJwtPayload(jwt);
    if (payload?.email) {
      const email = String(payload.email);
      return {
        userId: String(payload.sub ?? email),
        email,
        displayName: String(payload.name ?? email.split("@")[0] ?? "user"),
      };
    }
  }

  // 2) Simple header-based auth (demo / development)
  const emailHeader = c.req.header("X-User-Email");
  if (emailHeader) {
    return {
      userId: emailHeader,
      email: emailHeader,
      displayName: emailHeader.split("@")[0],
    };
  }

  // 3) Cookie-based session (set by /api/auth/login)
  const cookie = c.req.header("Cookie") ?? "";
  const match = cookie.match(/mnotation_user=([^;]+)/);
  if (match) {
    try {
      const decoded = decodeURIComponent(match[1]);
      const data = JSON.parse(decoded) as { email?: string; name?: string };
      if (data.email) {
        return {
          userId: data.email,
          email: data.email,
          displayName: data.name ?? data.email.split("@")[0],
        };
      }
    } catch { /* ignore malformed cookie */ }
  }

  return null;
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
