import { body, db, json, missingDb, requireAdmin } from "../_lib.js";

const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_PERSONA = "你是 shunliuzx.com 私人终端中的对话角色。说话自然、克制、敏锐，允许有一点锋利的玩笑感，但始终对管理员保持可靠和亲近。";
const DEFAULT_OPENING = "终端接通。说吧，今天要处理什么？";

async function ensureTables(database) {
  await database.prepare(`
    create table if not exists chat_settings (
      id integer primary key check (id = 1),
      character_name text default 'Terminal',
      persona text default '',
      opening text default '',
      updated_at text default current_timestamp
    )
  `).run();
  await database.prepare(`
    create table if not exists chat_messages (
      id integer primary key autoincrement,
      role text not null,
      content text not null,
      created_at text default current_timestamp
    )
  `).run();
  await database.prepare(`
    insert or ignore into chat_settings (id, character_name, persona, opening)
    values (1, 'Terminal', ?, ?)
  `).bind(DEFAULT_PERSONA, DEFAULT_OPENING).run();
}

async function readSettings(database) {
  await ensureTables(database);
  return await database.prepare("select * from chat_settings where id = 1").first();
}

async function readMessages(database, limit = 80) {
  await ensureTables(database);
  const result = await database.prepare(`
    select id, role, content, created_at from chat_messages
    order by id desc limit ?
  `).bind(limit).all();
  return (result.results || []).reverse();
}

function cleanText(value, max = 12000) {
  return String(value || "").trim().slice(0, max);
}

function systemPrompt(settings) {
  return [
    `角色名：${settings.character_name || "Terminal"}`,
    "人设：",
    settings.persona || DEFAULT_PERSONA,
    "开场白：",
    settings.opening || DEFAULT_OPENING,
    "规则：你正在一个私人网站的管理员对话页里回应。保持角色一致。不要声称自己能执行网站后台操作，除非用户明确让你给出步骤。回复使用中文。"
  ].join("\n");
}

async function callDeepSeek(env, settings, messages) {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }
  const payload = {
    model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemPrompt(settings) },
      ...messages.map((item) => ({ role: item.role, content: item.content }))
    ],
    temperature: 0.85,
    max_tokens: 900,
    stream: false
  };
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "DeepSeek 请求失败");
  }
  const reply = cleanText(data.choices?.[0]?.message?.content, 12000);
  if (!reply) throw new Error("DeepSeek 没有返回内容");
  return reply;
}

export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "需要管理员权限" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const settings = await readSettings(database);
  const messages = await readMessages(database);
  return json({ settings, messages, model: env.DEEPSEEK_MODEL || DEFAULT_MODEL, deepseekReady: !!env.DEEPSEEK_API_KEY });
}

export async function onRequestPatch({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "需要管理员权限" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  await ensureTables(database);
  const input = await body(request);
  await database.prepare(`
    update chat_settings set
      character_name = ?,
      persona = ?,
      opening = ?,
      updated_at = current_timestamp
    where id = 1
  `).bind(
    cleanText(input.character_name, 80) || "Terminal",
    cleanText(input.persona, 8000) || DEFAULT_PERSONA,
    cleanText(input.opening, 1000) || DEFAULT_OPENING
  ).run();
  return json({ ok: true, settings: await readSettings(database) });
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "需要管理员权限" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  await ensureTables(database);
  const input = await body(request);
  const message = cleanText(input.message, 4000);
  if (!message) return json({ error: "消息不能为空" }, { status: 400 });
  await database.prepare("insert into chat_messages (role, content) values ('user', ?)").bind(message).run();
  const settings = await readSettings(database);
  const history = await readMessages(database, 24);
  let reply;
  try {
    reply = await callDeepSeek(env, settings, history);
  } catch (error) {
    await database.prepare("insert into chat_messages (role, content) values ('assistant', ?)").bind(`调用失败：${error.message}`).run();
    return json({ error: error.message, messages: await readMessages(database) }, { status: 502 });
  }
  await database.prepare("insert into chat_messages (role, content) values ('assistant', ?)").bind(reply).run();
  return json({ ok: true, reply, messages: await readMessages(database) });
}

export async function onRequestDelete({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "需要管理员权限" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  await ensureTables(database);
  await database.prepare("delete from chat_messages").run();
  return json({ ok: true, messages: [] });
}
