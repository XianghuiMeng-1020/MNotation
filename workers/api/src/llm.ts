import type { Env } from "./types";

export type RunInput = {
  text: string;
  labels: string[];
  prompt: string;
  mode: "prompt1" | "prompt2" | "custom";
  /** Optional few-shot examples as JSON string for system prompt */
  fewShotBlock?: string;
};

export type LlmRunResult = {
  label: string;
  raw: string;
  model: string;
  provider: string;
  confidence: number | null;
  reasoning: string | null;
};

function parseLabel(text: string, labels: string[]) {
  try {
    const obj = JSON.parse(text);
    if (typeof obj?.label === "string" && labels.includes(obj.label)) {
      return {
        label: obj.label,
        confidence: typeof obj.confidence === "number" ? Math.min(1, Math.max(0, obj.confidence)) : null,
        reasoning: typeof obj.reasoning === "string" ? obj.reasoning : typeof obj.explanation === "string" ? obj.explanation : null
      };
    }
  } catch {
    /* fall through */
  }
  for (const l of labels) {
    if (text.includes(l)) return { label: l, confidence: null as number | null, reasoning: null as string | null };
  }
  return { label: labels[0] ?? "UNKNOWN", confidence: null, reasoning: null };
}

function buildSystemPrompt(input: RunInput) {
  const base = `${input.prompt}\nOutput JSON only: {"label":"ONE_LABEL","confidence":0.0-1.0,"reasoning":"short explanation"}`;
  if (input.fewShotBlock) return `${base}\n\nExamples:\n${input.fewShotBlock}`;
  return base;
}

async function callOpenAI(env: Env, input: RunInput): Promise<LlmRunResult> {
  const model = env.OPENAI_MODEL ?? "gpt-4o-mini";
  const base = env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: buildSystemPrompt(input) },
        { role: "user", content: input.text }
      ]
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json<any>();
  const raw = json?.choices?.[0]?.message?.content ?? "";
  const parsed = parseLabel(raw, input.labels);
  return { label: parsed.label, raw, model, provider: "openai", confidence: parsed.confidence, reasoning: parsed.reasoning };
}

async function callQwen(env: Env, input: RunInput): Promise<LlmRunResult> {
  const base = env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.QWEN_API_KEY}` },
    body: JSON.stringify({
      model: "qwen-plus",
      temperature: 0,
      messages: [
        { role: "system", content: buildSystemPrompt(input) },
        { role: "user", content: input.text }
      ]
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json<any>();
  const raw = json?.choices?.[0]?.message?.content ?? "";
  const parsed = parseLabel(raw, input.labels);
  return { label: parsed.label, raw, model: "qwen-plus", provider: "qwen", confidence: parsed.confidence, reasoning: parsed.reasoning };
}

async function callCustomLlm(env: Env, input: RunInput): Promise<LlmRunResult | null> {
  const base = env.CUSTOM_LLM_BASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  const model = env.CUSTOM_LLM_MODEL ?? "llama3";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.CUSTOM_LLM_API_KEY) headers.Authorization = `Bearer ${env.CUSTOM_LLM_API_KEY}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: buildSystemPrompt(input) },
        { role: "user", content: input.text }
      ]
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json<any>();
  const raw = json?.choices?.[0]?.message?.content ?? "";
  const parsed = parseLabel(raw, input.labels);
  return { label: parsed.label, raw, model, provider: "custom", confidence: parsed.confidence, reasoning: parsed.reasoning };
}

export async function runLlmWithFallback(env: Env, input: RunInput): Promise<LlmRunResult> {
  try {
    const custom = await callCustomLlm(env, input);
    if (custom) return custom;
  } catch {
    /* fall through */
  }
  try {
    if (env.QWEN_API_KEY) return await callQwen(env, input);
  } catch {
    /* fall through */
  }
  if (env.OPENAI_API_KEY) {
    try {
      return await callOpenAI(env, input);
    } catch {
      /* fall through */
    }
  }
  return {
    label: input.labels[0] ?? "UNKNOWN",
    raw: "no provider",
    model: "none",
    provider: "none",
    confidence: null,
    reasoning: null
  };
}

/** Suggest a codebook from sample texts (JSON array of {code, description}) */
export async function suggestCodebookFromSamples(env: Env, samples: string[]): Promise<{ raw: string; labels: Array<{ code: string; description: string }> }> {
  const system =
    "You are a qualitative research assistant. Given short text excerpts from the same corpus, propose a concise coding scheme with 5-12 codes. Output JSON only: {\"labels\":[{\"code\":\"SNAKE_CASE\",\"description\":\"...\"},...]}";
  const user = `Excerpts (numbered):\n${samples.map((s, i) => `${i + 1}. ${s.slice(0, 800)}`).join("\n\n")}`;
  const tryProviders: Array<() => Promise<Response>> = [
    async () => {
      const base = env.CUSTOM_LLM_BASE_URL?.replace(/\/$/, "");
      if (!base) throw new Error("skip");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (env.CUSTOM_LLM_API_KEY) headers.Authorization = `Bearer ${env.CUSTOM_LLM_API_KEY}`;
      return fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: env.CUSTOM_LLM_MODEL ?? "llama3",
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
    },
    async () =>
      fetch(`${env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.QWEN_API_KEY}` },
        body: JSON.stringify({
          model: "qwen-plus",
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      }),
    async () =>
      fetch(`${env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: env.OPENAI_MODEL ?? "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      })
  ];
  let raw = "";
  for (const fn of tryProviders) {
    try {
      const res = await fn();
      if (!res.ok) continue;
      const json = await res.json<any>();
      raw = json?.choices?.[0]?.message?.content ?? "";
      if (raw) break;
    } catch {
      /* next */
    }
  }
  let labels: Array<{ code: string; description: string }> = [];
  try {
    const obj = JSON.parse(raw);
    if (Array.isArray(obj?.labels)) {
      labels = obj.labels
        .filter((x: any) => x && typeof x.code === "string")
        .map((x: any) => ({
          code: String(x.code).toUpperCase().replace(/\s+/g, "_"),
          description: String(x.description ?? "")
        }));
    }
  } catch {
    /* empty */
  }
  return { raw, labels };
}

export async function pingLlm(env: Env) {
  const status = {
    qwen: Boolean(env.QWEN_API_KEY),
    openai: Boolean(env.OPENAI_API_KEY),
    custom: Boolean(env.CUSTOM_LLM_BASE_URL)
  };
  return status;
}
