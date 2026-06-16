import { body, db, json, missingDb, requireAdmin, role } from "../_lib.js";

function normalize(input) {
  return {
    title: input.title || "",
    summary: input.summary || "",
    content: input.content || "",
    tag: input.tag || "随笔",
    visible: input.visible === false ? 0 : 1
  };
}

export async function onRequestGet({ request, env }) {
  const database = db(env);
  if (!database) return missingDb();
  const userRole = await role(request, env);
  const query = userRole === "admin"
    ? "select id, title, summary, content, tag, visible, created_at, updated_at from blog_posts order by created_at desc"
    : "select id, title, summary, content, tag, visible, created_at, updated_at from blog_posts where visible = 1 order by created_at desc";
  const { results } = await database.prepare(query).all();
  return json({ items: results.map((item) => ({ ...item, visible: !!item.visible })) });
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const input = normalize(await body(request));
  await database.prepare("insert into blog_posts (title, summary, content, tag, visible) values (?, ?, ?, ?, ?)")
    .bind(input.title, input.summary, input.content, input.tag, input.visible)
    .run();
  return json({ ok: true });
}

export async function onRequestPatch({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const raw = await body(request);
  const input = normalize(raw);
  await database.prepare("update blog_posts set title = ?, summary = ?, content = ?, tag = ?, visible = ?, updated_at = current_timestamp where id = ?")
    .bind(input.title, input.summary, input.content, input.tag, input.visible, raw.id)
    .run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const id = new URL(request.url).searchParams.get("id");
  await database.prepare("delete from blog_posts where id = ?").bind(id).run();
  return json({ ok: true });
}
