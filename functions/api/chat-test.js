import { json, requireAdmin } from "../_lib.js";

const DEFAULT_MODEL = "deepseek-v4-flash";

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function deepSeekKey(env) {
  return env.DEEPSEEK_API_KEY || env.DEEPSEEK_KEY || env.DEEPSEEK_APIKEY || "";
}

function envStatus(env) {
  return {
    hasDeepSeekApiKey: hasText(deepSeekKey(env)),
    hasCanonicalDeepSeekApiKey: hasText(env.DEEPSEEK_API_KEY),
    hasDeepSeekKeyAlias: hasText(env.DEEPSEEK_KEY) || hasText(env.DEEPSEEK_APIKEY),
    modelConfigured: hasText(env.DEEPSEEK_MODEL),
    model: env.DEEPSEEK_MODEL || DEFAULT_MODEL
  };
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "需要管理员权限" }, { status: 403 });
  const status = envStatus(env);
  const apiKey = deepSeekKey(env);
  if (!hasText(apiKey)) {
    return json({
      ok: false,
      error: "后端没有读到 DEEPSEEK_API_KEY。请确认它在 Production 环境中，并在保存后重新部署。",
      envStatus: status
    }, { status: 503 });
  }

  const started = Date.now();
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: status.model,
      messages: [
        { role: "system", content: "你是连接测试助手。" },
        { role: "user", content: "请只回复：连接成功" }
      ],
      temperature: 0,
      max_tokens: 20,
      stream: false
    })
  });
  const data = await response.json().catch(() => ({}));
  const latencyMs = Date.now() - started;
  if (!response.ok) {
    return json({
      ok: false,
      error: data.error?.message || `DeepSeek 请求失败，HTTP ${response.status}`,
      status: response.status,
      latencyMs,
      envStatus: status
    }, { status: 502 });
  }

  return json({
    ok: true,
    reply: data.choices?.[0]?.message?.content || "",
    model: status.model,
    latencyMs,
    envStatus: status
  });
}
