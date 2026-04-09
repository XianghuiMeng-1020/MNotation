export type Phase = "normal" | "active" | "conflict_resolution";
export type Task = "manual" | "llm";
export type LlmMode = "prompt1" | "prompt2" | "custom";

export interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  STATS_HUB: DurableObjectNamespace;
  QWEN_LIMITER: DurableObjectNamespace;
  AL_RUNNER: DurableObjectNamespace;
  CHAT_HUB: DurableObjectNamespace;
  QWEN_BASE_URL?: string;
  QWEN_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  LLM_OPENAI_RATIO?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  AUTH_COOKIE_SECRET?: string;
  ALLOW_HEADER_AUTH?: string;
  ALLOWED_ORIGINS?: string;
  IRR_AUTO_CHECK_INTERVAL?: string;
  IRR_LOW_THRESHOLD?: string;
  /** Optional OpenAI-compatible endpoint (Ollama/vLLM) */
  CUSTOM_LLM_BASE_URL?: string;
  CUSTOM_LLM_API_KEY?: string;
  CUSTOM_LLM_MODEL?: string;
  /** Frontend Sentry DSN (optional, for server-side proxy if needed) */
  SENTRY_DSN?: string;
  /** Global fallback Qualtrics token (prefer not to use; pass per-request api_token when possible). */
  QUALTRICS_API_TOKEN?: string;
}

export type UserIdentity = {
  userId: string;
  email: string;
  displayName: string;
};
