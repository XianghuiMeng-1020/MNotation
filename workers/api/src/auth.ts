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

function toBase64Url(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((input.length + 3) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function signPayload(payloadB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return toBase64Url(new Uint8Array(sig));
}

type CookieSessionPayload = {
  email: string;
  name?: string;
  userId?: string;
  iat?: number;
};

export async function parseSessionCookieValue(rawValue: string, env: Pick<Env, "AUTH_COOKIE_SECRET">): Promise<UserIdentity | null> {
  try {
    const decoded = decodeURIComponent(rawValue);
    const secret = env.AUTH_COOKIE_SECRET;
    if (decoded.includes(".") && secret) {
      const [payloadB64, sigB64] = decoded.split(".", 2);
      const expectedSig = await signPayload(payloadB64, secret);
      if (sigB64 !== expectedSig) return null;
      const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as CookieSessionPayload;
      if (!payload.email) return null;
      return {
        userId: payload.userId ?? payload.email,
        email: payload.email,
        displayName: payload.name ?? payload.email.split("@")[0]
      };
    }
    if (!secret) {
      const legacy = JSON.parse(decoded) as CookieSessionPayload;
      if (!legacy.email) return null;
      return {
        userId: legacy.userId ?? legacy.email,
        email: legacy.email,
        displayName: legacy.name ?? legacy.email.split("@")[0]
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function createSessionCookieValue(payload: CookieSessionPayload, env: Env): Promise<string> {
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify({ ...payload, iat: Date.now() })));
  const secret = env.AUTH_COOKIE_SECRET;
  if (!secret) throw new Error("auth_cookie_secret_not_configured");
  const sigB64 = await signPayload(payloadB64, secret);
  return encodeURIComponent(`${payloadB64}.${sigB64}`);
}

async function parseCookieIdentity(c: Context<{ Bindings: Env }>): Promise<UserIdentity | null> {
  const cookie = c.req.header("Cookie") ?? "";
  const match = cookie.match(/mnotation_user=([^;]+)/);
  if (!match) return null;

  return parseSessionCookieValue(match[1], c.env);
}

async function extractIdentity(c: Context<{ Bindings: Env }>): Promise<UserIdentity | null> {
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

  // 2) Header-based auth for local/dev only (disabled by default)
  const emailHeader = c.req.header("X-User-Email");
  if (emailHeader && c.env.ALLOW_HEADER_AUTH === "true") {
    return {
      userId: emailHeader,
      email: emailHeader,
      displayName: emailHeader.split("@")[0],
    };
  }

  // 3) Signed cookie-based session (set by /api/auth/login)
  return parseCookieIdentity(c);
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const identity = await extractIdentity(c);
  if (!identity) return json(c, { error: "unauthorized" }, 401);

  const existing = await c.env.DB.prepare("SELECT user_id FROM users WHERE email=? LIMIT 1")
    .bind(identity.email)
    .first<{ user_id: string }>();
  const resolvedUser: UserIdentity = {
    ...identity,
    userId: existing?.user_id ?? identity.userId
  };

  (c as any).set("user", resolvedUser);
  await c.env.DB.prepare(
    "INSERT INTO users(user_id, email, display_name, created_at, last_active_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=COALESCE(excluded.display_name, users.display_name), last_active_at=excluded.last_active_at"
  ).bind(resolvedUser.userId, resolvedUser.email, resolvedUser.displayName, nowIso(), nowIso()).run();
  await next();
};

export function getUser(c: Context): UserIdentity {
  return (c as any).get("user");
}
