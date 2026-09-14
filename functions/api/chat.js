import { body, db, json, missingDb, requireAdmin } from "../_lib.js";

const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_PERSONA = "你是 shunliuzx.com 私人终端中的对话角色。说话自然、克制、敏锐，允许有一点锋利的玩笑感，但始终对管理员保持可靠和亲近。";
const DEFAULT_OPENING = "终端接通。说吧，今天要处理什么？";

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
    hasAdminPassword: hasText(env.ADMIN_PASSWORD),
    hasSessionSecret: hasText(env.SESSION_SECRET),
    modelConfigured: hasText(env.DEEPSEEK_MODEL),
    model: env.DEEPSEEK_MODEL || DEFAULT_MODEL
  };
}

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
  const apiKey = deepSeekKey(env);
  if (!hasText(apiKey)) {
    throw new Error("后端没有读到 DEEPSEEK_API_KEY。请确认它在 Production 环境中，并在保存后重新部署。");
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
      "authorization": `Bearer ${apiKey}`
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
  const status = envStatus(env);
  return json({ settings, messages, model: status.model, deepseekReady: status.hasDeepSeekApiKey, envStatus: status });
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
  const previous = await readMessages(database, 2);
  const last = previous.at(-1);
  if (input.retry && last?.role === "assistant" && previous.at(-2)?.role === "user" && previous.at(-2)?.content === message) {
    const messages = await readMessages(database);
    if (input.stream) return new Response(JSON.stringify({done:true,messages})+"\n",{headers:{"content-type":"application/x-ndjson; charset=utf-8","cache-control":"no-store"}});
    return json({ok:true,reply:last.content,messages});
  }
  const reuse = input.retry && last?.role === "user" && last?.content === message;
  if (!reuse) await database.prepare("insert into chat_messages (role, content) values ('user', ?)").bind(message).run();
  const settings = await readSettings(database);
  const history = await readMessages(database, 24);
  if (input.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let reply = "";
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 90000);
        const send = data => controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        try {
          const key = deepSeekKey(env);
          if (!hasText(key)) throw new Error("请先配置 DeepSeek 密钥");
          const response = await fetch("https://api.deepseek.com/chat/completions", {
            method:"POST", signal:abort.signal,
            headers:{"content-type":"application/json",authorization:"Bearer "+key},
            body:JSON.stringify({model:env.DEEPSEEK_MODEL||DEFAULT_MODEL,messages:[{role:"system",content:systemPrompt(settings)},...history.map(x=>({role:x.role,content:x.content}))],temperature:0.85,max_tokens:900,stream:true})
          });
          if(!response.ok) {const data=await response.json().catch(()=>({}));throw new Error(data.error?.message||"DeepSeek 请求失败")}
          if(!response.body)throw new Error("未收到回复流");
          const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="",complete=false;
          function consume(line) {
            if(!line.startsWith("data:"))return;
            const text=line.slice(5).trim();if(text==="[DONE]"){complete=true;return}
            if(!text)return;const part=JSON.parse(text);
            if(part.error)throw new Error(part.error.message||"生成失败");
            const delta=part.choices?.[0]?.delta?.content||"";
            if(delta){reply+=delta;send({delta})}
          }
          while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop();for(const line of lines)consume(line)}
          buffer+=decoder.decode();if(buffer.trim())consume(buffer);
          if(!complete||!reply.trim())throw new Error("回复未完成，请重试");
          await database.prepare("insert into chat_messages (role, content) values ('assistant', ?)").bind(reply).run();
          send({done:true,messages:await readMessages(database)});
        } catch(error) {
          try{send({error:error.name==="AbortError"?"回复超时，请重试":error.message})}catch{}
        } finally {clearTimeout(timer);try{controller.close()}catch{}}
      }
    });
    return new Response(stream,{headers:{"content-type":"application/x-ndjson; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
  }
  let reply;
  try {
    reply = await callDeepSeek(env, settings, history);
  } catch (error) {
    return json({ error: error.message, messages: await readMessages(database), envStatus: envStatus(env) }, { status: 502 });
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
