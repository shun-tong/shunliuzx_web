export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

export async function body(request) {
  return request.headers.get("content-type")?.includes("application/json")
    ? await request.json()
    : {};
}

export function db(env) {
  return env.SITE_DB || null;
}

export function missingDb() {
  return json({ error: "D1 database is not bound", cloudReady: false }, { status: 503 });
}

function cookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  return raw.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function digest(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((v) => v.toString(16).padStart(2, "0")).join("");
}

export async function sign(role, env) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 14;
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD || "dev-secret";
  const sig = await digest(`${role}.${exp}.${secret}`);
  return btoa(`${role}.${exp}.${sig}`);
}

export async function role(request, env) {
  const token = cookie(request, "sl_session");
  if (!token) return "visitor";
  try {
    const [savedRole, exp, sig] = atob(token).split(".");
    if (Date.now() > Number(exp)) return "visitor";
    const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD || "dev-secret";
    const expected = await digest(`${savedRole}.${exp}.${secret}`);
    return expected === sig ? savedRole : "visitor";
  } catch {
    return "visitor";
  }
}

export async function requireAdmin(request, env) {
  return (await role(request, env)) === "admin";
}

export function sessionCookie(value) {
  return `sl_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600`;
}

export function clearSessionCookie() {
  return "sl_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}
