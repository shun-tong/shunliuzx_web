import { json } from '../_lib.js';
import { GameError, act, joinRoom, makePlayer, makeRoom, publicView } from '../_rings-engine.js';

// Only this new table is initialized; existing website data is never modified.
export const ROOM_SCHEMA = `CREATE TABLE IF NOT EXISTS rings_rooms (
  code TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
)`;
const codePattern = /^[A-HJ-NP-Z2-9]{6}$/;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), v => alphabet[v % alphabet.length]).join('');
}
async function hash(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
}
function authorization(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (!/^[0-9a-f-]{36}$/.test(token)) throw new GameError('加入房间后才能操作', 401);
  return token;
}
async function load(database, code) {
  if (!codePattern.test(code)) throw new GameError('房间码应为 6 位字母或数字');
  const row = await database.prepare('SELECT state, version, expires_at FROM rings_rooms WHERE code = ?').bind(code).first();
  if (!row || row.expires_at < Date.now()) throw new GameError('房间不存在或已超过 24 小时，请创建新房间', 404);
  return { room: JSON.parse(row.state), version: row.version };
}
async function save(database, room, version) {
  const result = await database.prepare('UPDATE rings_rooms SET state = ?, version = version + 1 WHERE code = ? AND version = ?')
    .bind(JSON.stringify(room), room.code, version).run();
  if (result.meta.changes !== 1) throw new GameError('房间刚刚发生变化，请重试', 409);
}
async function respond(context, method) {
  const { request, env } = context;
  try {
    const database = env.SITE_DB;
    if (!database) throw new GameError('联机服务尚未配置：请为网站绑定 SITE_DB 数据库', 503);
    if (method === 'POST') {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) throw new GameError('不允许跨网站操作', 403);
      if (!request.headers.get('content-type')?.includes('application/json')) throw new GameError('请求格式不正确', 415);
      const raw = await request.text();
      if (raw.length > 6000) throw new GameError('请求内容过长', 413);
      let input;
      try { input = JSON.parse(raw); } catch { throw new GameError('请求内容不是有效的数据'); }
      if (!input || typeof input !== 'object') throw new GameError('请求格式不正确');
      if (input.action === 'create') {
        await database.prepare(ROOM_SCHEMA).run();
        const token = crypto.randomUUID(), player = makePlayer(input.name, await hash(token));
        // Expired rooms contain only game data and are cleaned on room creation.
        await database.prepare('DELETE FROM rings_rooms WHERE expires_at < ?').bind(Date.now()).run();
        for (let attempt = 0; attempt < 4; attempt++) {
          const room = makeRoom(roomCode(), player);
          const result = await database.prepare('INSERT OR IGNORE INTO rings_rooms (code, state, version, expires_at) VALUES (?, ?, 0, ?)')
            .bind(room.code, JSON.stringify(room), room.expiresAt).run();
          if (result.meta.changes === 1) return json({ token, view: publicView(room, player.id, 0) }, { status: 201 });
        }
        throw new GameError('创建房间失败，请重试', 503);
      }
      const code = String(input.code || '').toUpperCase();
      const { room, version } = await load(database, code);
      if (input.action === 'join') {
        const token = crypto.randomUUID(), player = joinRoom(room, input.name, await hash(token));
        await save(database, room, version);
        return json({ token, view: publicView(room, player.id, version + 1) });
      }
      const tokenHash = await hash(authorization(request));
      const player = room.players.find(p => p.tokenHash === tokenHash);
      if (!player) throw new GameError('身份已失效，请重新加入房间', 403);
      if (typeof input.requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(input.requestId)) throw new GameError('操作编号不正确');
      if (room.receipts.some(r => r.id === input.requestId && r.player === player.id)) return json({ view: publicView(room, player.id, version) });
      if (input.version !== version) throw new GameError('房间刚刚发生变化，已保留你的选择，请重试', 409);
      act(room, player.id, input);
      room.receipts.push({ id: input.requestId, player: player.id });
      room.receipts = room.receipts.slice(-40);
      await save(database, room, version);
      return json({ view: input.action === 'leave' ? null : publicView(room, player.id, version + 1) });
    }
    const code = (new URL(request.url).searchParams.get('code') || '').toUpperCase();
    const { room, version } = await load(database, code);
    const tokenHash = await hash(authorization(request));
    const player = room.players.find(p => p.tokenHash === tokenHash);
    if (!player) throw new GameError('身份已失效，请重新加入房间', 403);
    return json({ view: publicView(room, player.id, version) });
  } catch (error) {
    if (error instanceof GameError) return json({ error: error.message }, { status: error.status });
    console.error('Rings service error', error);
    return json({ error: '联机服务暂时不可用，请稍后重试；若首次部署，请检查 SITE_DB 绑定' }, { status: 503 });
  }
}
export const onRequestGet = context => respond(context, 'GET');
export const onRequestPost = context => respond(context, 'POST');
