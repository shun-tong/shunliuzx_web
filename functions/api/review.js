import { body, db, json, missingDb, requireAdmin } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const subjects = await database.prepare("select id, name, total_hours, spent_hours, exam_date, note, created_at from review_subjects order by exam_date asc").all();
  const days = await database.prepare("select id, day, available_hours, note, created_at from review_days order by day asc").all();
  return json({ subjects: subjects.results, days: days.results });
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const input = await body(request);
  if (input.type === "day") {
    await database.prepare("insert into review_days (day, available_hours, note) values (?, ?, ?) on conflict(day) do update set available_hours = excluded.available_hours, note = excluded.note")
      .bind(input.day || "", Number(input.available_hours || 0), input.note || "")
      .run();
    return json({ ok: true });
  }
  await database.prepare("insert into review_subjects (name, total_hours, spent_hours, exam_date, note) values (?, ?, ?, ?, ?)")
    .bind(input.name || "", Number(input.total_hours || 0), Number(input.spent_hours || 0), input.exam_date || "", input.note || "")
    .run();
  return json({ ok: true });
}

export async function onRequestPatch({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const input = await body(request);
  await database.prepare("update review_subjects set spent_hours = ? where id = ?")
    .bind(Number(input.spent_hours || 0), input.id)
    .run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  if (type === "day") {
    await database.prepare("delete from review_days where id = ?").bind(id).run();
  } else {
    await database.prepare("delete from review_subjects where id = ?").bind(id).run();
  }
  return json({ ok: true });
}
