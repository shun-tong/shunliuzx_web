import { body, json, requireAdmin } from "../_lib.js";

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
    "你要把一份中文大学课表整理成 JSON 数组。输入已经按页和星期分列，例如【星期一】下面的所有内容默认都属于星期一。",
    "只输出 JSON 数组，不要 Markdown，不要解释。",
    "每个课程对象必须包含这些字段：course_name, weekday, weekday_label, start_section, end_section, weeks, campus, location, teacher, raw。",
    "weekday 用 1-7 表示星期一到星期日。weekday 必须优先由列标题【星期一】到【星期日】决定，不要从文本位置猜。",
    "start_section 和 end_section 是第几节课，范围 1-14。形如 (7-9节) 表示 start_section=7,end_section=9。",
    "课程卡片只需要真实课程，不要时间段、标题、姓名、学号、空白格。",
    "如果同一课程在不同星期、不同节次或不同周次出现，拆成多条。",
    "如果地点是未排地点，location 写 未排地点。教师缺失可写空字符串。",
    "每个课程的 raw 字段保留你依据的原始片段。",
    "下面是已经按星期分列的课表文本：",
    text
  ].join("\n");
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "需要管理员权限" }, { status: 403 });
  const input = await body(request);
  const text = clean(input.text, 50000);
  if (!text) return json({ error: "没有可交给 DeepSeek 的 PDF 文本" }, { status: 400 });

  const apiKey = deepSeekKey(env);
  if (!hasText(apiKey)) {
    return json({ error: "后端没有读到 DEEPSEEK_API_KEY" }, { status: 503 });
  }

  const model = env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "你是严谨的课表结构化解析器，只输出合法 JSON。" },
        { role: "user", content: promptFor(text) }
      ],
      temperature: 0,
      max_tokens: 4096,
      stream: false
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({ error: data.error?.message || `DeepSeek 请求失败，HTTP ${response.status}` }, { status: 502 });
  }

  let parsed;
  try {
    parsed = extractJson(data.choices?.[0]?.message?.content);
  } catch (error) {
    return json({ error: error.message, raw: clean(data.choices?.[0]?.message?.content, 2000) }, { status: 502 });
  }
  const items = (Array.isArray(parsed) ? parsed : [])
    .map(normalizeCourse)
    .filter((item) => item.course_name && item.weekday >= 1 && item.weekday <= 7 && item.start_section >= 1);
  return json({ ok: true, model, count: items.length, items });
}
