export function onRequestGet({ request }) {
  const ip = request.headers.get("CF-Connecting-IP");
  return new Response(JSON.stringify(ip ? { ip } : { error: "无法获取公网 IP" }), {
    status: ip ? 200 : 503,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "CDN-Cache-Control": "no-store"
    }
  });
}
