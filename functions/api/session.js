import { db, json, role } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  return json({
    role: await role(request, env),
    cloudReady: !!db(env)
  });
}
