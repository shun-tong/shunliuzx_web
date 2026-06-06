import { body, db, json, missingDb, requireAdmin } from "../_lib.js";

export async function onRequestGet({ env }) {
  const database = db(env);
  if (!database) return missingDb();
  const { results } = await database.prepare("select id, text, source, tag, created_at from quotes order by created_at desc").all();
  return json({ items: results });
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const input = await body(request);
  await database.prepare("insert into quotes (text, source, tag) values (?, ?, ?)").bind(input.text || "", input.source || "", input.tag || "未分类").run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const id = new URL(request.url).searchParams.get("id");
  await database.prepare("delete from quotes where id = ?").bind(id).run();
  return json({ ok: true });
}
