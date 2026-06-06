import { body, db, json, missingDb, requireAdmin } from "../_lib.js";

export async function onRequestGet({ env }) {
  const database = db(env);
  if (!database) return missingDb();
  const item = await database.prepare("select now, mode, battery, focus, note, updated_at from status_log order by updated_at desc limit 1").first();
  return json(item || { now: "未记录", mode: "UNKNOWN", battery: 50, focus: 50, note: "" });
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const input = await body(request);
  await database.prepare("insert into status_log (now, mode, battery, focus, note) values (?, ?, ?, ?, ?)").bind(input.now || "", input.mode || "在线", Number(input.battery || 50), Number(input.focus || 50), input.note || "").run();
  return json({ ok: true });
}
