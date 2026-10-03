import { CARDS, randomRules, shuffle } from './_rings-data.js';

export const ROOM_TTL = 24 * 60 * 60 * 1000;
export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new GameError(message, status); };
export function nickname(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 20) fail('昵称需要 1–20 个字符');
  return value.trim();
}
const region = value => {
  if (!Number.isInteger(value) || value < 0 || value > 7) fail('请选择有效的分类区域');
  return value;
};
function log(room, message) {
  room.history.push({ id: crypto.randomUUID(), message });
  room.history = room.history.slice(-200);
}
export function makePlayer(name, tokenHash) {
  return { id: crypto.randomUUID(), name: nickname(name), tokenHash, hand: [] };
}
export function makeRoom(code, host) {
  return {
    code, host: host.id, players: [host], phase: 'lobby', round: 0,
    rules: randomRules(), deck: [], board: [], clues: [], pending: null,
    turn: null, winner: null, outcome: null, history: [], receipts: [],
    createdAt: Date.now(), expiresAt: Date.now() + ROOM_TTL
  };
}
export function publicView(room, playerId, version) {
  const me = room.players.find(p => p.id === playerId);
  if (!me) fail('你已不在这个房间，请重新加入', 403);
  const isHost = playerId === room.host;
  const ended = room.phase === 'finished';
  return {
    code: room.code, version, phase: room.phase, round: room.round,
    host: room.host, me: { id: me.id, name: me.name, isHost, hand: me.hand },
    players: room.players.map(p => ({ id: p.id, name: p.name, count: p.hand.length })),
    rules: isHost || ended ? room.rules : null,
    clues: isHost ? room.clues : [], board: room.board, pending: room.pending,
    turn: room.turn, winner: room.winner, outcome: room.outcome,
    deckCount: room.deck.length, history: room.history, expiresAt: room.expiresAt
  };
}
export function joinRoom(room, name, tokenHash) {
  if (room.phase !== 'lobby') fail('这局已经开始，等待全知者开启下一局后再加入', 409);
  if (room.players.length >= 6) fail('房间已满，最多 6 人', 409);
  const player = makePlayer(name, tokenHash);
  if (room.players.some(p => p.name === player.name)) fail('这个昵称已被使用，请换一个');
  room.players.push(player);
  log(room, `${player.name} 加入了房间`);
  return player;
}
export function act(room, playerId, input) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) fail('你已不在房间', 403);
  const host = playerId === room.host;
  const hostOnly = () => { if (!host) fail('只有全知者可以进行这个操作', 403); };
  const lobbyOnly = () => { if (room.phase !== 'lobby') fail('只能在准备阶段操作', 409); };
  switch (input.action) {
    case 'randomize':
      hostOnly(); lobbyOnly(); room.rules = randomRules(); break;
    case 'rules': {
      hostOnly(); lobbyOnly();
      const rules = {};
      for (const key of ['attribute', 'word', 'context']) {
        const rule = input.rules?.[key];
        if (!rule || typeof rule.en !== 'string' || !rule.en.trim() || rule.en.length > 200 || typeof rule.zh !== 'string' || rule.zh.length > 200) fail('请填写三条规则，每段最多 200 字符');
        rules[key] = { en: rule.en.trim(), zh: rule.zh.trim() };
      }
      room.rules = rules; break;
    }
    case 'remove':
      hostOnly(); lobbyOnly();
      if (input.playerId === room.host || !room.players.some(p => p.id === input.playerId)) fail('不能移除这名玩家');
      room.players = room.players.filter(p => p.id !== input.playerId); break;
    case 'start': {
      hostOnly(); lobbyOnly();
      // Competitive mode needs one Knower and at least two Finders.
      if (room.players.length < 3) fail('竞技模式需要至少 3 人：1 名全知者和 2 名猜测者');
      room.deck = shuffle(CARDS); room.board = []; room.pending = null;
      room.winner = null; room.outcome = null; room.history = []; room.round++;
      for (const p of room.players) p.hand = p.id === room.host ? [] : room.deck.splice(0, 5);
      room.clues = room.deck.splice(0, 5); room.phase = 'clues'; room.turn = null;
      log(room, `第 ${room.round} 局开始，全知者先从 5 张牌中放置 3 张线索`);
      break;
    }
    case 'clue': {
      hostOnly(); if (room.phase !== 'clues') fail('现在不是放置开局线索的阶段', 409);
      const mask = region(input.mask);
      const index = room.clues.findIndex(c => c.id === input.cardId);
      if (index < 0) fail('请选择一张开局线索牌');
      const [card] = room.clues.splice(index, 1);
      room.board.push({ card, mask, player: player.name, clue: true });
      log(room, `全知者放置线索 ${card.en}（${card.zh}）`);
      if (room.board.length === 3) {
        room.clues = []; room.phase = 'playing';
        room.turn = room.players.find(p => p.id !== room.host).id;
      }
      break;
    }
    case 'play': {
      if (host || room.phase !== 'playing' || room.turn !== playerId) fail('还没轮到你出牌', 409);
      if (room.pending) fail('请等待全知者判定', 409);
      const mask = region(input.mask);
      const card = player.hand.find(c => c.id === input.cardId);
      if (!card) fail('这张牌不在你的手牌中', 409);
      room.pending = { card, mask, playerId, playerName: player.name };
      break;
    }
    case 'judge': {
      hostOnly();
      if (room.phase !== 'playing' || !room.pending) fail('没有需要判定的出牌', 409);
      if (input.pendingCardId !== room.pending.card.id) fail('待判定的牌已经变化，请刷新后重试', 409);
      const mask = region(input.mask), pending = room.pending;
      const finder = room.players.find(p => p.id === pending.playerId);
      const correct = mask === pending.mask;
      finder.hand = finder.hand.filter(c => c.id !== pending.card.id);
      room.board.push({ card: pending.card, mask, player: finder.name, clue: false });
      room.pending = null;
      if (correct) {
        log(room, `${finder.name} 正确放置 ${pending.card.en}（${pending.card.zh}），继续出牌`);
        if (!finder.hand.length) {
          room.phase = 'finished'; room.winner = finder.id; room.outcome = 'winner';
          log(room, `${finder.name} 清空手牌，赢得本局`);
        }
      } else {
        if (!room.deck.length) {
          room.phase = 'finished'; room.outcome = 'exhausted'; room.turn = null;
          log(room, '物品牌已用尽，本局结束，无获胜者');
          break;
        }
        finder.hand.push(room.deck.shift());
        const finders = room.players.filter(p => p.id !== room.host);
        room.turn = finders[(finders.findIndex(p => p.id === finder.id) + 1) % finders.length].id;
        log(room, `${finder.name} 的 ${pending.card.en}（${pending.card.zh}）被纠正，摸 1 张并结束回合`);
      }
      break;
    }
    case 'restart':
      hostOnly();
      if (room.phase !== 'finished') fail('请等本局结束后再开启下一局', 409);
      room.phase = 'lobby'; room.deck = []; room.board = []; room.clues = [];
      room.pending = null; room.turn = null; room.winner = null; room.outcome = null;
      room.rules = randomRules(); room.players.forEach(p => { p.hand = []; });
      room.history = []; break;
    case 'leave':
      lobbyOnly();
      if (host) fail('全知者需留在房间；其他人可以退出');
      room.players = room.players.filter(p => p.id !== playerId); break;
    default: fail('未知操作');
  }
}
