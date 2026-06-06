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
  await database.prepare("insert into tasks (title, time, level, note, done) values (?, ?, ?, ?, ?)").bind(input.title || "", input.time || "", input.level || "普通", input.note || "", input.done ? 1 : 0).run();
  return json({ ok: true });
}

export async function onRequestPatch({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const input = await body(request);
  if (input.toggle) {
    await database.prepare("update tasks set done = case done when 1 then 0 else 1 end where id = ?").bind(input.id).run();
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
