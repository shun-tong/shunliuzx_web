import { body, db, json, missingDb, requireAdmin } from "../_lib.js";

export async function onRequestGet({ env }) {
  const database = db(env);
  if (!database) return missingDb();
  const { results } = await database.prepare("select id, title, time, level, note, done, created_at from tasks order by coalesce(time, created_at) asc").all();
  return json({ items: results.map((item) => ({ ...item, done: !!item.done })) });
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const input = await body(request);
  if (!String(input.title || "").trim()) return json({ error: "请填写任务名称" }, { status: 400 });
  await database.prepare("insert into tasks (title, time, level, note, done) values (?, ?, ?, ?, ?)").bind(input.title.trim(), input.time || "", input.level || "普通", input.note || "", input.done ? 1 : 0).run();
  return json({ ok: true });
}

export async function onRequestPatch({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const input = await body(request);
  if (!input.id) return json({ error: "缺少任务编号" }, { status: 400 });
  if (input.toggle) {
    await database.prepare("update tasks set done = case done when 1 then 0 else 1 end where id = ?").bind(input.id).run();
  } else {
    if (!String(input.title || "").trim()) return json({ error: "请填写任务名称" }, { status: 400 });
    await database.prepare("update tasks set title = ?, time = ?, level = ?, note = ? where id = ?").bind(input.title.trim(), input.time || "", input.level || "普通", input.note || "", input.id).run();
  }
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const id = new URL(request.url).searchParams.get("id");
  await database.prepare("delete from tasks where id = ?").bind(id).run();
  return json({ ok: true });
}
