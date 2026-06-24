import { body, db, json, missingDb, requireAdmin } from "../_lib.js";

function clean(value) {
  return String(value || "").trim();
}

function course(input) {
  return {
    course_name: clean(input.course_name || input.name),
    weekday: Number(input.weekday || 0),
    weekday_label: clean(input.weekday_label),
    start_section: Number(input.start_section || 0),
    end_section: Number(input.end_section || 0),
    weeks: clean(input.weeks),
    campus: clean(input.campus),
    location: clean(input.location),
    teacher: clean(input.teacher),
    raw: clean(input.raw),
    source: clean(input.source || "pdf")
  };
}

export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const { results } = await database.prepare(
    "select id, course_name, weekday, weekday_label, start_section, end_section, weeks, campus, location, teacher, raw, source, created_at from timetable_courses order by weekday asc, start_section asc, course_name asc"
  ).all();
  return json({ items: results });
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const input = await body(request);
  const items = Array.isArray(input.items) ? input.items.map(course).filter((item) => item.course_name && item.weekday && item.start_section) : [];
  if (input.replace) {
    await database.prepare("delete from timetable_courses").run();
  }
  const insert = database.prepare(
    "insert into timetable_courses (course_name, weekday, weekday_label, start_section, end_section, weeks, campus, location, teacher, raw, source) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const item of items) {
    await insert.bind(
      item.course_name,
      item.weekday,
      item.weekday_label,
      item.start_section,
      item.end_section || item.start_section,
      item.weeks,
      item.campus,
      item.location,
      item.teacher,
      item.raw,
      item.source
    ).run();
  }
  return json({ ok: true, count: items.length });
}

export async function onRequestDelete({ request, env }) {
  if (!(await requireAdmin(request, env))) return json({ error: "admin required" }, { status: 403 });
  const database = db(env);
  if (!database) return missingDb();
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    await database.prepare("delete from timetable_courses where id = ?").bind(id).run();
  } else {
    await database.prepare("delete from timetable_courses").run();
  }
  return json({ ok: true });
}
