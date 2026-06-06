import { body, clearSessionCookie, json, sessionCookie, sign } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  const input = await body(request);
  if (input.action === "logout") {
    return json({ ok: true, role: "visitor" }, { headers: { "set-cookie": clearSessionCookie() } });
  }
  if (!env.ADMIN_PASSWORD) {
    return json({ error: "ADMIN_PASSWORD is not configured" }, { status: 503 });
  }
  if (input.password !== env.ADMIN_PASSWORD) {
    return json({ error: "管理员口令不正确" }, { status: 401 });
  }
  return json({ ok: true, role: "admin" }, { headers: { "set-cookie": sessionCookie(await sign("admin", env)) } });
}
