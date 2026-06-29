import { json, requireAdmin } from "../_lib.js";

const DEFAULT_MODEL = "deepseek-v4-flash";
const weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function clean(value, max = 12000) {
  return String(value || "").trim().slice(0, max);
}

function deepSeekKey(env) {
  return env.DEEPSEEK_API_KEY || env.DEEPSEEK_KEY || env.DEEPSEEK_APIKEY || "";
}

function normalizeCourse(input) {
  const weekday = Number(input.weekday || 0);
  const start = Number(input.start_section || input.start || 0);
  const end = Number(input.end_section || input.end || start || 0);
  return {
    course_name: clean(input.course_name || input.name, 120),
    weekday,
    weekday_label: clean(input.weekday_label || weekdays[weekday - 1] || "", 20),
    start_section: start,
    end_section: end || start,
    weeks: clean(input.weeks, 120),
    campus: clean(input.campus, 80),
    location: clean(input.location, 120),
    teacher: clean(input.teacher, 120),
    raw: clean(input.raw, 1200),
    source: "deepseek"
  };
}

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("DeepSeek 没有返回内容");
  try {
    return JSON.parse(raw);
  } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("DeepSeek 返回内容不是 JSON 数组");
}

function promptFor(text) {
  return [
    "把中文大学课表候选项校正成 JSON 数组。输入已按星期分组，【星期一】下面的课程都属于星期一。",
    "只输出 JSON 数组，不要 Markdown，不要解释。",
    "字段：course_name, weekday, weekday_label, start_section, end_section, weeks, campus, location, teacher, raw。",
    "weekday 用 1-7，必须由【星期一】到【星期日】标题决定。",
    "删除学号、姓名、课表标题、时间段、空白格等非课程项。",
    "如果一条原文里黏连了多个课程，请拆成多条。",
    "课程名优先取 ◇ 或 ◆ 前面的真实课程名。",
    "(7-9节) 表示 start_section=7,end_section=9。",
    "地点是未排地点时 location 写 未排地点。教师缺失可写空字符串。",
    clean(text, 12000)
  ].join("\n");
}

async function requestJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function callDeepSeek(env, text) {
  const apiKey = deepSeekKey(env);
  if (!hasText(apiKey)) {
    throw new Error("后端没有读到 DEEPSEEK_API_KEY。请确认它在 Production 环境中，并在保存后重新部署。");
  }

  const model = env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), 15000);
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "你是课表结构化解析器，只输出合法 JSON。" },
          { role: "user", content: promptFor(text) }
        ],
        temperature: 0,
        max_tokens: 1200,
        stream: false
      })
    });
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {}
    if (!response.ok) {
      throw new Error(data.error?.message || clean(raw, 500) || `DeepSeek 请求失败，HTTP ${response.status}`);
    }
    return { data, model };
  } catch (error) {
    if (error.name === "AbortError" || error.message === "timeout") {
      throw new Error("DeepSeek 解析超时，请稍后重试或先使用本地解析结果保存。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const isAdmin = await requireAdmin(request, env);
    return json({ ok: true, route: "timetable-ai", admin: isAdmin, hasDeepSeekApiKey: hasText(deepSeekKey(env)), model: env.DEEPSEEK_MODEL || DEFAULT_MODEL });
  } catch (error) {
    return json({ ok: false, error: error.message || "自检失败" }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!(await requireAdmin(request, env))) return json({ error: "需要管理员权限" }, { status: 403 });
    const input = await requestJson(request);
    const text = clean(input.text, 20000);
    if (!text) return json({ error: "没有可交给 DeepSeek 的课表文本" }, { status: 400 });

    const result = await callDeepSeek(env, text);
    let parsed;
    try {
      parsed = extractJson(result.data.choices?.[0]?.message?.content);
    } catch (error) {
      return json({ error: error.message, raw: clean(result.data.choices?.[0]?.message?.content, 2000), model: result.model }, { status: 502 });
    }

    const items = (Array.isArray(parsed) ? parsed : [])
      .map(normalizeCourse)
      .filter((item) => item.course_name && item.weekday >= 1 && item.weekday <= 7 && item.start_section >= 1);
    return json({ ok: true, model: result.model, count: items.length, items });
  } catch (error) {
    return json({ error: error.message || "课表 AI 解析失败" }, { status: 502 });
  }
}
