import { body, clearSessionCookie, db, json, sessionCookie, sign } from "../_lib.js";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 30 * 60 * 1000;
const MAX_FAILURES = 5;

async function digest(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((v) => v.toString(16).padStart(2, "0")).join("");
}

function clientIp(request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function retryText(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}

async function ensureAttemptTable(database) {
  await database.prepare(`
    create table if not exists auth_attempts (
      client_key text primary key,
      failed_count integer default 0,
      locked_until integer default 0,
      updated_at integer not null
    )
  `).run();
}

async function attemptState(request, env) {
  const database = db(env);
  if (!database) return null;
  await ensureAttemptTable(database);
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD || "site-secret";
  const key = await digest(`${clientIp(request)}.${secret}`);
  const row = await database.prepare("select * from auth_attempts where client_key = ?").bind(key).first();
  return { database, key, row };
}

async function rejectIfLocked(state, now) {
  if (!state?.row?.locked_until || Number(state.row.locked_until) <= now) return null;
  const wait = Number(state.row.locked_until) - now;
  return json(
    { error: `登录尝试过多，请 ${retryText(wait)} 分钟后再试` },
    { status: 429, headers: { "retry-after": String(Math.ceil(wait / 1000)) } }
  );
}

async function recordFailure(state, now) {
  if (!state) return;
  const freshWindow = !state.row || now - Number(state.row.updated_at || 0) > WINDOW_MS;
  const failedCount = freshWindow ? 1 : Number(state.row.failed_count || 0) + 1;
  const lockedUntil = failedCount >= MAX_FAILURES ? now + LOCK_MS : 0;
  await state.database.prepare(`
    insert into auth_attempts (client_key, failed_count, locked_until, updated_at)
    values (?, ?, ?, ?)
    on conflict(client_key) do update set
      failed_count = excluded.failed_count,
      locked_until = excluded.locked_until,
      updated_at = excluded.updated_at
  `).bind(state.key, failedCount, lockedUntil, now).run();
}

async function clearFailures(state) {
  if (!state) return;
  await state.database.prepare("delete from auth_attempts where client_key = ?").bind(state.key).run();
}

export async function onRequestPost({ request, env }) {
  const input = await body(request);
  if (input.action === "logout") {
    return json({ ok: true, role: "visitor" }, { headers: { "set-cookie": clearSessionCookie() } });
  }
  if (!env.ADMIN_PASSWORD) {
    return json({ error: "ADMIN_PASSWORD is not configured" }, { status: 503 });
  }

  const now = Date.now();
  const state = await attemptState(request, env);
  const locked = await rejectIfLocked(state, now);
  if (locked) return locked;

  if (input.password !== env.ADMIN_PASSWORD) {
    await recordFailure(state, now);
    return json({ error: "管理员口令不正确" }, { status: 401 });
  }

  await clearFailures(state);
  return json({ ok: true, role: "admin" }, { headers: { "set-cookie": sessionCookie(await sign("admin", env)) } });
}
