import { json, requireAdmin } from "../_lib.js";

const DEFAULT_MODEL = "deepseek-v4-flash";
const WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function clean(value, max = 12000) {
  return String(value || "").trim().slice(0, max);
}

function apiKey(env) {
  return env.DEEPSEEK_API_KEY || env.DEEPSEEK_KEY || env.DEEPSEEK_APIKEY || "";
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function prompt(text) {
  return [
    "Convert the following Chinese university timetable candidates into a JSON array.",
    "The input is grouped by weekday. Items under [星期一] belong to Monday, [星期二] to Tuesday, and so on.",
    "Output JSON only. No markdown. No explanation.",
    "Each object must contain: course_name, weekday, weekday_label, start_section, end_section, weeks, campus, location, teacher, raw.",
    "weekday must be 1-7 for Monday-Sunday and must come from the weekday group title.",
    "Remove non-course entries such as student id, name, timetable title, time labels, and empty cells.",
    "If one raw entry contains multiple glued courses, split them into separate objects.",
    "Course name is usually before the marker ◇ or ◆, for example 高等数学ⅠB◇(1-3节) means course_name is 高等数学ⅠB.",
    "(7-9节) means start_section=7 and end_section=9.",
    "If location is 未排地点, keep it as 未排地点. Missing teacher can be an empty string.",
    clean(text, 10000)
  ].join("\n");
}

function parseJsonArray(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("empty model response");
  try {
    return JSON.parse(raw);
  } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("model response is not a JSON array");
}

function normalize(input) {
  const weekday = Number(input.weekday || 0);
  const start = Number(input.start_section || input.start || 0);
  const end = Number(input.end_section || input.end || start || 0);
  return {
    course_name: clean(input.course_name || input.name, 120),
    weekday,
    weekday_label: clean(input.weekday_label || WEEKDAYS[weekday - 1] || "", 20),
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

async function deepseek(env, text) {
  const key = apiKey(env);
  if (!hasText(key)) throw new Error("DEEPSEEK_API_KEY is not configured");
  const model = env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a strict timetable JSON parser. Return valid JSON only." },
          { role: "user", content: prompt(text) }
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
    if (!response.ok) throw new Error(data.error?.message || clean(raw, 500) || `HTTP ${response.status}`);
    return { data, model };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("DeepSeek request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);
    return json({ ok: true, route: "timetable_ai", admin, hasDeepSeekApiKey: hasText(apiKey(env)), model: env.DEEPSEEK_MODEL || DEFAULT_MODEL });
  } catch (error) {
    return json({ ok: false, error: error.message || "health check failed" }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
    const input = await readJson(request);
    const text = clean(input.text, 15000);
    if (!text) return json({ error: "empty timetable text" }, { status: 400 });

    const result = await deepseek(env, text);
    let parsed;
    try {
      parsed = parseJsonArray(result.data.choices?.[0]?.message?.content);
    } catch (error) {
      return json({ error: error.message, raw: clean(result.data.choices?.[0]?.message?.content, 2000), model: result.model }, { status: 502 });
    }

    const items = (Array.isArray(parsed) ? parsed : [])
      .map(normalize)
      .filter((item) => item.course_name && item.weekday >= 1 && item.weekday <= 7 && item.start_section >= 1);
    return json({ ok: true, model: result.model, count: items.length, items });
  } catch (error) {
    return json({ error: error.message || "timetable ai failed" }, { status: 502 });
  }
}
