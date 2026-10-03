import { SYLLABLES, syllableInfo } from '../rings/syllables.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { CARDS, RULES, DEFAULT_PACK } from '../functions/_rings-data.js';
import { act, makePlayer, makeRoom, joinRoom, publicView } from '../functions/_rings-engine.js';
import { onRequestGet, onRequestPost } from '../functions/api/rings.js';
import { LocalDatabase } from '../scripts/rings-local-db.mjs';
import { cardFace, ruleFace, facePath } from '../rings/card-media.js';
import { statSync } from 'node:fs';
globalThis.crypto ??= webcrypto;

test('all 342 card faces map to existing files; text-only cards and edited rules have no false images', () => {
  for (const card of CARDS) {
    assert.equal(cardFace(card), `/rings/card-faces/${card.sourceCardId}.webp`);
    assert.ok(statSync(new URL(`../rings/card-faces/${card.sourceCardId}.webp`, import.meta.url)).size > 100);
  }
  for (const [category, rules] of Object.entries(DEFAULT_PACK.rules)) for (const rule of rules) {
    assert.equal(ruleFace(rule, category), `/rings/card-faces/${rule.sourceCardId}.webp`);
    assert.ok(statSync(new URL(`../rings/card-faces/${rule.sourceCardId}.webp`, import.meta.url)).size > 100);
  }
  assert.equal(cardFace({ id: 'import-0', en: 'APPLE' }), null);
  assert.equal(ruleFace({ en: 'My own rule' }, 'word'), null);
  assert.equal(facePath(9999), null); assert.equal(facePath('../500'), null);
  assert.equal(cardFace({ id: 'workshop-1431' }), '/rings/card-faces/1431.webp');
});

function fixture() {
  const host = makePlayer('全知者', 'host-secret'), room = makeRoom('ABC234', host);
  const one = joinRoom(room, '小王', 'one-secret'), two = joinRoom(room, '小李', 'two-secret');
  act(room, host.id, { action: 'start' });
  for (let i = 0; i < 3; i++) act(room, host.id, { action: 'clue', cardId: room.clues[0].id, mask: i });
  return { room, host, one, two };
}
test('workshop deck is unique and bilingual', () => {
  assert.equal(CARDS.length, 270);
  assert.equal(new Set(CARDS.map(c => c.en)).size, CARDS.length);
  assert.ok(CARDS.every(c => c.en && c.zh));
});

test('imported packs stay in their room, preserve English, hide unused cards and survive restart', () => {
  const host = makePlayer('主持', 'h'), room = makeRoom('ABC234', host);
  const one = joinRoom(room, '一', 'p'); joinRoom(room, '二', 'q');
  const pack = { name: '本地牌组', cards: Array.from({ length: 40 }, (_, i) => ({ en: `THING ${i}`, zh: '' })), rules: Object.fromEntries(['attribute', 'word', 'context'].map(key => [key, [{ en: `${key} rule`, zh: '辅助翻译' }]])) };
  assert.throws(() => act(room, one.id, { action: 'import', pack }), /只有全知者/);
  act(room, host.id, { action: 'import', pack });
  assert.deepEqual(publicView(room, one.id, 0).pack, { name: '本地牌组', count: 40, ruleCounts: { attribute: 1, word: 1, context: 1 } });
  assert.equal(publicView(room, one.id, 0).rules, null);
  act(room, host.id, { action: 'start' });
  assert.ok(one.hand.every(c => c.en.startsWith('THING ') && c.zh === ''));
  assert.equal(room.rules.word.en, 'word rule');
  assert.throws(() => act(room, host.id, { action: 'reset-pack' }), /准备阶段/);
  room.phase = 'finished'; act(room, host.id, { action: 'restart' });
  assert.equal(room.pack.cards.length, 40);
  const before = JSON.stringify(room.pack);
  pack.cards[1].en = pack.cards[0].en;
  assert.throws(() => act(room, host.id, { action: 'import', pack }), /重复/);
  assert.equal(JSON.stringify(room.pack), before);
  act(room, host.id, { action: 'reset-pack' });
  assert.equal(publicView(room, host.id, 0).pack.count, 270);
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


test('transcription covers every workshop card slot and preserves unusual spellings', () => {
  const sizes = { 5: 20, 6: 47, 7: 14, 8: 9, 9: 46, 10: 48, 11: 11, 12: 23, 13: 20, 14: 32 };
  const expected = Object.entries(sizes).flatMap(([sheet, count]) => Array.from({ length: count }, (_, i) => Number(sheet) * 100 + i));
  assert.deepEqual(CARDS.map(c => c.sourceCardId), expected);
  for (const [key, sheet] of [['attribute', 3], ['word', 2], ['context', 4]]) {
    assert.equal(RULES[key].length, 24);
    assert.equal(new Set(RULES[key].map(r => r[0])).size, 24);
    assert.deepEqual(DEFAULT_PACK.rules[key].map(r => r.sourceCardId), Array.from({ length: 24 }, (_, i) => sheet * 100 + i));
  }
  assert.equal(CARDS.find(c => c.sourceCardId === 1100).en, 'I.D.');
  assert.equal(CARDS.find(c => c.sourceCardId === 1301).en, 'MJÖLNIR');
  assert.equal(CARDS.find(c => c.sourceCardId === 1431).zh, '棒球棒');
  assert.equal(CARDS.find(c => c.sourceCardId === 1400).en, 'CHOCOLATES');
  assert.equal(CARDS.find(c => c.sourceCardId === 935).en, 'YOYO');
});

test('rule bags exhaust each set of 24 without repeats, persist, and avoid repeating at boundaries', () => {
  const host = makePlayer('主持', 'h'); let room = makeRoom('ABC234', host);
  const draws = { attribute: [], word: [], context: [] };
  for (let i = 0; i < 48; i++) {
    if (i) act(room, host.id, { action: 'randomize' });
    for (const key of Object.keys(draws)) {
      const r = room.rules[key]; draws[key].push(r.en);
      assert.ok(RULES[key].some(([en, zh]) => en === r.en && zh === r.zh));
    }
    room = JSON.parse(JSON.stringify(room));
  }
  for (const list of Object.values(draws)) {
    assert.equal(new Set(list.slice(0, 24)).size, 24);
    assert.equal(new Set(list.slice(24)).size, 24);
    assert.notEqual(list[23], list[24]);
  }
  assert.deepEqual(publicView(room, host.id, 1).ruleRemaining, { attribute: 0, word: 0, context: 0 });
  const player = joinRoom(room, '玩家', 'p');
  assert.equal(publicView(room, player.id, 1).ruleRemaining, null);
  assert.equal(publicView(room, player.id, 1).ruleDrawState, undefined);
});


test('syllable aid covers the original deck without changing spellings or hiding variants', () => {
  assert.equal(Object.keys(SYLLABLES).length, CARDS.length);
  for (const card of CARDS) {
    const info = syllableInfo(card.en);
    assert.ok(info, card.en);
    assert.equal(info.parts.join(''), card.en);
    assert.ok(info.counts.includes(info.parts.length), card.en);
  }
  for (const [word, count] of [['COMB',1], ['DICE',1], ['OCEAN',2], ['PIANO',3], ['I.D.',2], ['MJÖLNIR',2]])
    assert.equal(syllableInfo(word).parts.length, count, word);
  assert.deepEqual(syllableInfo('camera').counts, [2,3]);
  assert.deepEqual(syllableInfo('TOWEL').counts, [1,2]);
  assert.ok(syllableInfo('NECRONOMICON').note);
  assert.equal(syllableInfo('my unknown imported word'), null);
  assert.equal(syllableInfo(null), null);
});
