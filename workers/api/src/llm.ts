import type { Env } from "./types";

type RunInput = {
  text: string;
  labels: string[];
  prompt: string;
  mode: "prompt1" | "prompt2" | "custom";
};

function parseLabel(text: string, labels: string[]) {
  try {
    const obj = JSON.parse(text);
    if (typeof obj?.label === "string" && labels.includes(obj.label)) return obj.label;
  } catch {}
  for (const l of labels) {
    if (text.includes(l)) return l;
  }
  return labels[0] ?? "UNKNOWN";
}

async function callOpenAI(env: Env, input: RunInput) {
  const model = env.OPENAI_MODEL ?? "gpt-4o-mini";
  const base = env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: `${input.prompt}\nOutput JSON: {"label":"ONE_LABEL"}` },
        { role: "user", content: input.text }
      ]
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json<any>();
  const raw = json?.choices?.[0]?.message?.content ?? "";
  return { label: parseLabel(raw, input.labels), raw, model, provider: "openai" };
}

async function callQwen(env: Env, input: RunInput) {
  const base = env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.QWEN_API_KEY}` },
    body: JSON.stringify({
      model: "qwen-plus",
      temperature: 0,
      messages: [
        { role: "system", content: `${input.prompt}\nOutput JSON: {"label":"ONE_LABEL"}` },
        { role: "user", content: input.text }
      ]
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json<any>();
  const raw = json?.choices?.[0]?.message?.content ?? "";
  return { label: parseLabel(raw, input.labels), raw, model: "qwen-plus", provider: "qwen" };
}

export async function runLlmWithFallback(env: Env, input: RunInput) {
  try {
    if (env.QWEN_API_KEY) return await callQwen(env, input);
  } catch {}
  if (env.OPENAI_API_KEY) return callOpenAI(env, input);
  return { label: input.labels[0] ?? "UNKNOWN", raw: "no provider", model: "none", provider: "none" };
}

export async function pingLlm(env: Env) {
  const status = {
    qwen: Boolean(env.QWEN_API_KEY),
    openai: Boolean(env.OPENAI_API_KEY)
  };
  return status;
}
