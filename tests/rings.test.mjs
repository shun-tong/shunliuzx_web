import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { CARDS } from '../functions/_rings-data.js';
import { act, makePlayer, makeRoom, joinRoom, publicView } from '../functions/_rings-engine.js';
import { onRequestGet, onRequestPost } from '../functions/api/rings.js';
import { LocalDatabase } from '../scripts/rings-local-db.mjs';
globalThis.crypto ??= webcrypto;

function fixture() {
  const host = makePlayer('全知者', 'host-secret'), room = makeRoom('ABC234', host);
  const one = joinRoom(room, '小王', 'one-secret'), two = joinRoom(room, '小李', 'two-secret');
  act(room, host.id, { action: 'start' });
  for (let i = 0; i < 3; i++) act(room, host.id, { action: 'clue', cardId: room.clues[0].id, mask: i });
  return { room, host, one, two };
}
test('sample deck is unique and bilingual', () => {
  assert.equal(CARDS.length, 180);
  assert.equal(new Set(CARDS.map(c => c.en)).size, CARDS.length);
  assert.ok(CARDS.every(c => c.en && c.zh));
});
test('private views never expose rules, deck, tokens or other hands', () => {
  const { room, host, one, two } = fixture();
  const view = publicView(room, one.id, 1), raw = JSON.stringify(view);
  assert.equal(view.rules, null); assert.deepEqual(view.clues, []);
  assert.equal(view.me.hand.length, 5);
  assert.ok(!raw.includes('host-secret') && !raw.includes('two-secret') && !raw.includes(two.hand[0].en));
  assert.equal(view.deck, undefined); assert.ok(publicView(room, host.id, 1).rules);
});
test('three clues required, minimum players and roles enforced', () => {
  const host = makePlayer('主持', 'h'), room = makeRoom('ABC234', host);
  joinRoom(room, '玩家', 'p');
  assert.throws(() => act(room, host.id, { action: 'start' }), /至少 3 人/);
  const player = joinRoom(room, '另一人', 'q');
  act(room, host.id, { action: 'start' });
  assert.equal(room.phase, 'clues');
  assert.throws(() => act(room, player.id, { action: 'clue', cardId: room.clues[0].id, mask: 0 }), /只有全知者/);
  assert.throws(() => act(room, player.id, { action: 'play', cardId: player.hand[0].id, mask: 0 }), /没轮到/);
});
test('correct play continues; wrong play draws and rotates; only host judges', () => {
  const { room, host, one, two } = fixture();
  let card = one.hand[0];
  act(room, one.id, { action: 'play', cardId: card.id, mask: 7 });
  assert.equal(one.hand.length, 5);
  assert.throws(() => act(room, two.id, { action: 'judge', mask: 7, pendingCardId: card.id }), /只有全知者/);
  assert.throws(() => act(room, one.id, { action: 'play', cardId: card.id, mask: 7 }), /等待全知者/);
  act(room, host.id, { action: 'judge', mask: 7, pendingCardId: card.id });
  assert.equal(one.hand.length, 4); assert.equal(room.turn, one.id);
  card = one.hand[0]; const remaining = room.deck.length;
  act(room, one.id, { action: 'play', cardId: card.id, mask: 1 });
  act(room, host.id, { action: 'judge', mask: 4, pendingCardId: card.id });
  assert.equal(one.hand.length, 4); assert.equal(room.deck.length, remaining - 1); assert.equal(room.turn, two.id);
  assert.equal(room.board.at(-1).mask, 4);
});
test('winner reveals rules; next round resets cards but preserves identities', () => {
  const { room, host, one, two } = fixture();
  for (const card of [...one.hand]) {
    act(room, one.id, { action: 'play', cardId: card.id, mask: 0 });
    act(room, host.id, { action: 'judge', mask: 0, pendingCardId: card.id });
  }
  assert.equal(room.phase, 'finished'); assert.equal(room.winner, one.id);
  assert.ok(publicView(room, two.id, 1).rules);
  act(room, host.id, { action: 'restart' });
  assert.equal(room.phase, 'lobby'); assert.equal(room.players.length, 3); assert.equal(one.hand.length, 0);
  assert.equal(publicView(room, two.id, 1).rules, null);
});
test('invalid masks, non-hand cards, duplicate names and in-game joins rejected', () => {
  const { room, host, one } = fixture();
  assert.throws(() => act(room, one.id, { action: 'play', cardId: one.hand[0].id, mask: 8 }), /区域/);
  assert.throws(() => act(room, one.id, { action: 'play', cardId: 'not-my-card', mask: 0 }), /手牌/);
  assert.throws(() => joinRoom(room, '新玩家', 's'), /已经开始/);
  assert.throws(() => act(room, host.id, { action: 'rules', rules: {} }), /准备阶段/);
});
test('deck exhaustion ends clearly rather than corrupting a hand', () => {
  const { room, host, one } = fixture(); room.deck = [];
  const card = one.hand[0];
  act(room, one.id, { action: 'play', cardId: card.id, mask: 0 });
  act(room, host.id, { action: 'judge', mask: 1, pendingCardId: card.id });
  assert.equal(room.phase, 'finished'); assert.equal(room.outcome, 'exhausted'); assert.equal(room.winner, null);
});

test('API persists rooms, validates identities, rejects stale writes and deduplicates retries', async () => {
  const database = new LocalDatabase();
  const call = async (input, token = null) => {
    const headers = { 'content-type': 'application/json', origin: 'https://example.com' };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await onRequestPost({ env: { SITE_DB: database }, request: new Request('https://example.com/api/rings', { method: 'POST', headers, body: JSON.stringify(input) }) });
    return { status: response.status, ...(await response.json()) };
  };
  const created = await call({ action: 'create', name: '主持' });
  assert.equal(created.status, 201); const code = created.view.code;
  const joined = await call({ action: 'join', code, name: '玩家' });
  assert.equal(joined.status, 200); assert.equal(joined.view.rules, null);
  const requestId = crypto.randomUUID();
  let result = await call({ action: 'randomize', code, version: 0, requestId }, created.token);
  assert.equal(result.status, 409);
  result = await call({ action: 'randomize', code, version: 1, requestId }, created.token);
  assert.equal(result.status, 200); assert.equal(result.view.version, 2);
  const retry = await call({ action: 'randomize', code, version: 1, requestId }, created.token);
  assert.equal(retry.status, 200); assert.equal(retry.view.version, 2);
  const unauthorized = await call({ action: 'randomize', code, version: 2, requestId: crypto.randomUUID() }, joined.token);
  assert.equal(unauthorized.status, 403);
  const badToken = await onRequestGet({ env: { SITE_DB: database }, request: new Request(`https://example.com/api/rings?code=${code}`, { headers: { authorization: `Bearer ${crypto.randomUUID()}` } }) });
  assert.equal(badToken.status, 403);
  const get = await onRequestGet({ env: { SITE_DB: database }, request: new Request(`https://example.com/api/rings?code=${code}`, { headers: { authorization: `Bearer ${joined.token}` } }) });
  assert.equal(get.status, 200); assert.equal((await get.json()).view.rules, null);
});

test('API concurrent writes cannot silently overwrite another player', async () => {
  const database = new LocalDatabase();
  const request = body => new Request('https://example.com/api/rings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const created = await (await onRequestPost({ env: { SITE_DB: database }, request: request({ action: 'create', name: '主持' }) })).json();
  const responses = await Promise.all(['甲', '乙'].map(name => onRequestPost({ env: { SITE_DB: database }, request: request({ action: 'join', code: created.view.code, name }) })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const row = database.rows.get(created.view.code);
  assert.equal(JSON.parse(row.state).players.length, 2);
});

test('missing database and cross-origin posts fail safely', async () => {
  let response = await onRequestGet({ env: {}, request: new Request('https://example.com/api/rings') });
  assert.equal(response.status, 503);
  response = await onRequestPost({ env: { SITE_DB: new LocalDatabase() }, request: new Request('https://example.com/api/rings', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{"action":"create","name":"n"}' }) });
  assert.equal(response.status, 403);
});
