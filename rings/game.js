const app = document.querySelector('#app');
const keys = ['attribute', 'word', 'context'];
const labels = { attribute: '属性', word: '词汇', context: '情境' };
const classes = { attribute: 'attr', word: 'word', context: 'context' };
const regions = [
  { label: '圈外', short: '圈外', x: 86, y: 11 },
  { label: '仅属性', short: '属性', x: 26, y: 35 },
  { label: '仅词汇', short: '词汇', x: 74, y: 35 },
  { label: '属性 + 词汇', short: '属性∩词汇', x: 50, y: 21 },
  { label: '仅情境', short: '情境', x: 50, y: 86 },
  { label: '属性 + 情境', short: '属性∩情境', x: 34, y: 63 },
  { label: '词汇 + 情境', short: '词汇∩情境', x: 66, y: 63 },
  { label: '三个环都符合', short: '三者交集', x: 50, y: 49 }
];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let session = null, view = null, selectedCard = null, selectedMask = null;
let busy = false, refreshing = false, status = '正在连接', pollTimer;
let ruleDraft = null, judgeMask = null, judgeCard = null, lastRequest = null;
let connectionError = '';
try { session = JSON.parse(sessionStorage.getItem('rings-session') || 'null'); } catch {}
function toast(message) {
  const box = document.querySelector('#feedback');
  box.textContent = message; box.hidden = false;
  clearTimeout(box.timer); box.timer = setTimeout(() => { box.hidden = true; }, 6500);
}
async function api(input, token = session?.token) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const options = { cache: 'no-store', signal: controller.signal, headers: {} };
    if (token) options.headers.authorization = `Bearer ${token}`;
    let url = `/api/rings?code=${encodeURIComponent(session?.code || '')}`;
    if (input) {
      url = '/api/rings'; options.method = 'POST';
      options.headers['content-type'] = 'application/json'; options.body = JSON.stringify(input);
    }
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({ error: '服务返回了无效内容，请稍后再试' }));
    if (!response.ok) { const error = new Error(data.error || '操作失败'); error.status = response.status; throw error; }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('连接超时，你的选择已保留，请重试');
    throw error;
  } finally { clearTimeout(timeout); }
}
function saveSession(data) {
  session = { code: data.view.code, token: data.token };
  try { sessionStorage.setItem('rings-session', JSON.stringify(session)); } catch {}
  history.replaceState(null, '', `/rings/?room=${session.code}`);
  view = data.view; connectionError = ''; status = '已连接'; ruleDraft = null;
  render(); schedulePoll();
}
function forgetSession() {
  session = null; view = null; selectedCard = null; selectedMask = null; ruleDraft = null;
  lastRequest = null; clearTimeout(pollTimer);
  try { sessionStorage.removeItem('rings-session'); } catch {}
  history.replaceState(null, '', '/rings/'); render();
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (session) pollTimer = setTimeout(refresh, document.hidden ? 7000 : 2200);
}
async function refresh() {
  if (busy || refreshing || !session) { schedulePoll(); return; }
  refreshing = true;
  try {
    const data = await api(); status = '已连接'; connectionError = '';
    const changed = !view || data.view.version !== view.version;
    if (!view || data.view.version >= view.version) view = data.view;
    if (changed) render(); else updateConnection();
  } catch (error) {
    if ([401, 403, 404].includes(error.status)) { forgetSession(); toast(error.message); }
    else { status = '连接中断，正在重试'; connectionError = error.message; if (view) updateConnection(); else render(); }
  } finally { refreshing = false; schedulePoll(); }
}
function updateConnection() {
  const el = document.querySelector('#connection');
  if (el) { el.textContent = status; el.classList.toggle('error', !!connectionError); el.title = connectionError; }
}
async function perform(payload) {
  if (busy || !view) return;
  busy = true; document.body.classList.add('busy');
  const input = { ...payload, code: view.code, version: view.version, requestId: crypto.randomUUID() };
  // Keep the same operation id for retrying an uncertain response.
  const payloadKey = JSON.stringify(payload);
  if (lastRequest?.key === payloadKey) input.requestId = lastRequest.id;
  lastRequest = { key: payloadKey, id: input.requestId };
  try {
    const data = await api(input);
    lastRequest = null; connectionError = ''; status = '已连接';
    if (!data.view) { forgetSession(); return; }
    view = data.view;
    if (['play', 'clue', 'start', 'restart'].includes(payload.action)) { selectedCard = null; selectedMask = null; }
    if (['restart', 'randomize', 'rules', 'import', 'reset-pack'].includes(payload.action)) ruleDraft = null;
    if (payload.action === 'rules') toast('隐藏规则已保存');
    render();
  } catch (error) {
    toast(error.message);
    if (error.status) lastRequest = null;
    if ([401, 403, 404].includes(error.status)) forgetSession();
    else if (error.status === 409) {
      try { view = (await api()).view; render(); } catch {}
    }
  } finally { busy = false; document.body.classList.remove('busy'); schedulePoll(); }
}
function circles() {
  return `<svg viewBox="0 0 900 700" aria-hidden="true"><circle cx="340" cy="270" r="220" fill="#37c6ec" fill-opacity=".055" stroke="#37c6ec" stroke-width="3"/><circle cx="560" cy="270" r="220" fill="#ffc348" fill-opacity=".045" stroke="#ffc348" stroke-width="3"/><circle cx="450" cy="450" r="220" fill="#ee70ae" fill-opacity=".055" stroke="#ee70ae" stroke-width="3"/></svg>`;
}
function entry() {
  const code = new URLSearchParams(location.search).get('room') || '';
  return `<section class="entry"><div><p class="eyebrow">朋友的推理牌桌</p><h1>三个环，<br>三条隐藏规则。</h1><p class="muted entry-intro">一人担任全知者，其他人把物品牌放进合适的区域。从每次放置和纠正中，找出规则。</p><div class="entry-art">${circles()}</div><details class="rules-help"><summary>怎么玩</summary><ol class="howto"><li>至少 3 人。创建房间的人担任全知者，另外 2–5 人为猜测者。</li><li>全知者查看三个环的隐藏规则，先放置 3 张线索。</li><li>猜测者选一张手牌，再选区域。放对可继续出牌；放错由全知者纠正，摸 1 张并换人。</li><li>最先清空手牌的人获胜。只按牌面英文名判断词汇规则。</li></ol></details></div><div class="entry-forms">${connectionError ? `<p class="connection-note">${esc(connectionError)}</p>` : ''}<form class="panel" id="create-form"><h2>开一张牌桌</h2><p class="muted">你来担任全知者。</p><label for="create-name">你的昵称</label><input id="create-name" name="name" maxlength="20" required autocomplete="nickname" placeholder="输入昵称"><button class="primary" type="submit">创建房间</button></form><form class="panel" id="join-form"><h2>加入朋友</h2><label for="join-name">你的昵称</label><input id="join-name" name="name" maxlength="20" required autocomplete="nickname" placeholder="输入昵称"><label for="join-code">6 位房间码</label><input id="join-code" name="code" required maxlength="6" minlength="6" pattern="[A-HJ-NP-Za-hj-np-z2-9]{6}" value="${esc(code)}" placeholder="例如 AB3DEF" autocapitalize="characters" autocomplete="off"><button type="submit">加入房间</button></form></div></section>`;
}
function members() {
  return `<section class="panel"><h3>牌桌成员 <span class="muted">${view.players.length}/6</span></h3><ul class="members">${view.players.map(p => `<li><span class="avatar">${esc(p.name.slice(0, 1))}</span><span class="name">${esc(p.name)}${p.id === view.me.id ? ' <small class="muted">你</small>' : ''}<br>${p.id === view.host ? '<span class="badge">全知者</span>' : p.id === view.turn ? '<span class="badge turn">当前回合</span>' : '<small class="muted">猜测者</small>'}</span><span class="count">${p.id !== view.host && view.phase !== 'lobby' ? `${p.count} 张牌` : ''}</span>${view.me.isHost && view.phase === 'lobby' && p.id !== view.host ? `<button class="small-button quiet danger" data-remove="${p.id}" aria-label="移除 ${esc(p.name)}">移除</button>` : ''}</li>`).join('')}</ul>${view.phase === 'lobby' && !view.me.isHost ? '<button class="quiet small-button" data-action="leave">退出房间</button>' : ''}<p class="lobby-note">同一浏览器标签页刷新可回到房间。房间在创建 24 小时后失效。</p></section>`;
}
function rules(edit = false) {
  if (!view.rules) return '';
  if (edit && !ruleDraft) ruleDraft = structuredClone(view.rules);
  return `<section class="panel rules-panel"><h2>${view.phase === 'finished' ? '规则揭晓' : '隐藏规则 · 仅你可见'}</h2><div class="rules-grid">${keys.map(key => {
    const r = edit ? ruleDraft[key] : view.rules[key];
    return `<div class="rule ${classes[key]}"><h3>${labels[key]}</h3>${edit ? `<label for="${key}-en">英文规则</label><textarea id="${key}-en" data-rule="${key}" data-lang="en" maxlength="200">${esc(r.en)}</textarea><label for="${key}-zh">中文辅助翻译</label><textarea id="${key}-zh" data-rule="${key}" data-lang="zh" maxlength="200">${esc(r.zh)}</textarea>` : `<p>${esc(r.en)}</p><p class="translation">${esc(r.zh)}</p>`}</div>`;
  }).join('')}</div>${edit ? '<div class="row divider"><button class="primary" id="save-rules">保存规则</button><button class="quiet" data-action="randomize">重新抽取</button></div><p class="lobby-note">英文拼写不区分大小写。属性与情境按物品通常的状态判断，全知者应保持一致。</p>' : ''}</section>`;
}
function packPanel() {
  return `<section class="panel pack-panel"><h3>本房间牌组</h3><p>${esc(view.pack?.name || '自编示例牌组')} · ${view.pack?.count || 180} 张</p>${view.me.isHost ? `<label class="pack-label" for="import-pack">导入文字牌组（JSON）</label><input id="import-pack" type="file" accept=".json,application/json"><a class="pack-example" href="/rings/sample-pack.json" download>下载文字牌组示例</a><p class="lobby-note">只需全知者导入，朋友加入后会使用同一副牌。英文名称用于判断，中文可留空。牌组文字会存入本房间并发给参与者；图片不上传。</p><button class="quiet small-button" data-action="reset-pack">恢复示例牌组</button>` : ''}</section>`;
}
function lobby() {
  return `<div class="roomgrid"><div>${view.me.isHost ? `${rules(true)}<section class="panel" style="margin-top:18px"><div class="row spread"><div><h3>准备好了吗？</h3><p class="muted" style="margin:0">至少 3 人，每名猜测者初始 5 张手牌。</p></div><button class="primary" id="start-game" ${view.players.length < 3 ? 'disabled' : ''}>开始游戏</button></div></section>` : '<section class="panel player-wait"><p class="eyebrow">你是猜测者</p><h2>等待全知者开始</h2><p class="muted">规则暂时保密。开始后，全知者会放置 3 张线索，你可以据此推理。</p><div class="legend"><span class="attr">属性</span><span class="word">词汇</span><span class="context">情境</span></div></section>'}</div><aside class="sidebar">${members()}${packPanel()}<section class="panel"><h3>邀请朋友</h3><p class="muted">把房间码或邀请链接发给朋友。仅准备阶段可以加入。</p><button class="quiet" id="copy-invite">复制邀请链接</button></section></aside></div>`;
}
function turnText() {
  if (view.phase === 'clues') return view.me.isHost ? `放置开局线索 ${view.board.length}/3` : '等待全知者放置 3 张开局线索';
  if (view.phase === 'finished') return '本局结束';
  if (view.pending) return view.me.isHost ? '请判定这张牌' : `等待全知者判定 ${view.pending.playerName} 的出牌`;
  const name = view.players.find(p => p.id === view.turn)?.name;
  return view.me.id === view.turn ? '轮到你了：选牌，再选区域' : `轮到 ${name} 出牌`;
}
function board() {
  const cards = view.me.isHost ? view.clues : view.me.hand;
  const selected = cards.find(c => c.id === selectedCard);
  const playable = view.phase === 'clues' ? view.me.isHost : view.phase === 'playing' && view.turn === view.me.id && !view.pending;
  return `<section class="panel board-panel"><div class="row spread"><h2 style="margin:0">${esc(turnText())}</h2><span class="muted" style="font-size:14px">剩余 ${view.deckCount} 张</span></div><div class="legend" style="margin-top:16px"><span class="attr"><i class="swatch"></i>属性</span><span class="word"><i class="swatch"></i>词汇</span><span class="context"><i class="swatch"></i>情境</span></div><p class="board-hint muted">词语显示在实际分类区域内；区域内可滚动，点击标题选择区域。</p><div class="board-scroll"><div class="board">${circles()}${regions.map((r, mask) => {
    const placed = view.board.filter(c => c.mask === mask), pending = view.pending?.mask === mask ? view.pending : null;
    return `<section class="region region-panel ${selectedMask === mask ? 'selected' : ''} ${pending ? 'pending' : ''}" style="left:${r.x}%;top:${r.y}%" aria-label="${r.label}"><button class="region-title" data-region="${mask}" aria-pressed="${selectedMask === mask}">${r.short}<small>${placed.length} 张</small></button><div class="region-words" tabindex="0" aria-label="${r.label}中的词语">${placed.map(c => `<div class="region-word"><b>${esc(c.card.en)}</b>${c.card.zh ? `<small>${esc(c.card.zh)}</small>` : ''}</div>`).join('')}${pending ? `<div class="region-word awaiting"><b>${esc(pending.card.en)}</b><small>${esc(pending.card.zh)} · 待判定</small></div>` : ''}${!placed.length && !pending ? '<span class="region-placeholder">暂无词语</span>' : ''}</div></section>`;
  }).join('')}</div></div><div class="selection"><p>${selected ? `<b>${esc(selected.en)}</b>（${esc(selected.zh)}）` : '先选择下方的一张牌'}${selectedMask !== null ? `<br><span class="muted">区域：${regions[selectedMask].label}</span>` : '<br><span class="muted">点击棋盘区域可查看已放置的牌</span>'}</p>${playable ? `<button class="primary" id="place-card" ${!selected || selectedMask === null ? 'disabled' : ''}>${view.phase === 'clues' ? '放置线索' : '提交给全知者'}</button>` : ''}</div>${selectedMask !== null ? `<div style="margin-top:18px"><h3>${regions[selectedMask].label}的物品</h3><div class="board-cards">${view.board.filter(c => c.mask === selectedMask).map(c => `<span class="board-card"><b>${esc(c.card.en)}</b><small>${esc(c.card.zh)}${c.clue ? ' · 线索' : ''}</small></span>`).join('') || '<p class="muted">这个区域还没有物品牌。</p>'}</div></div>` : ''}</section>`;
}
function judge() {
  if (!view.pending) return '';
  const p = view.pending;
  if (!view.me.isHost) return `<section class="panel"><h3>正在等待判定</h3><div class="pending-card"><strong>${esc(p.card.en)}</strong><p>${esc(p.card.zh)}</p></div><p class="muted">${esc(p.playerName)} 选择：${regions[p.mask].label}</p></section>`;
  if (judgeCard !== p.card.id) { judgeCard = p.card.id; judgeMask = p.mask; }
  return `<section class="panel judge"><h3>全知者判定</h3><div class="pending-card"><strong>${esc(p.card.en)}</strong><p>${esc(p.card.zh)}</p></div><p class="muted">${esc(p.playerName)} 选择：${regions[p.mask].label}</p><p style="font-size:14px;margin-bottom:0">勾选这件物品实际符合的规则：</p><div class="mask-choice">${keys.map((key, i) => `<label class="${classes[key]}"><input type="checkbox" data-judge-bit="${1 << i}" ${judgeMask & (1 << i) ? 'checked' : ''}>${labels[key]}</label>`).join('')}</div><p id="judge-target" class="muted" style="font-size:14px">正确区域：${regions[judgeMask].label}</p><button class="primary" id="confirm-judge">${judgeMask === p.mask ? '位置正确，允许继续出牌' : '纠正位置，摸牌并换人'}</button></section>`;
}
function hand() {
  if (view.me.isHost && view.phase !== 'clues') return '';
  const cards = view.me.isHost ? view.clues : view.me.hand;
  const enabled = view.phase === 'clues' ? view.me.isHost : view.phase === 'playing' && view.me.id === view.turn && !view.pending;
  return `<section class="panel hand-panel"><div class="hand-heading"><h2>${view.me.isHost ? '选择 3 张开局线索' : '你的手牌'} <span class="muted">${cards.length} 张</span></h2><p class="muted" style="font-size:14px">${enabled ? '选牌后点击棋盘区域' : '手牌只对你可见'}</p></div><div class="hand">${cards.map(card => `<button class="card ${selectedCard === card.id ? 'selected' : ''}" data-card="${card.id}" aria-pressed="${selectedCard === card.id}" ${!enabled ? 'disabled' : ''}><strong>${esc(card.en)}</strong><span>${esc(card.zh)}</span></button>`).join('') || '<p class="muted">你已经清空手牌。</p>'}</div></section>`;
}
function game() {
  const winner = view.players.find(p => p.id === view.winner);
  return `${view.phase === 'finished' ? `<section class="panel winner"><div class="row spread"><div><h2>${winner ? `${esc(winner.name)} 获胜` : '牌堆用尽，本局结束'}</h2><p class="muted">${winner ? '手牌全部正确放置，下面揭晓三个环的规则。' : '本局没有获胜者，可以开启下一局。'}</p></div>${view.me.isHost ? '<button class="primary" data-action="restart">准备下一局</button>' : ''}</div></section>` : ''}<div class="roomgrid"><div>${board()}${hand()}</div><aside class="sidebar">${judge()}${view.me.isHost || view.phase === 'finished' ? rules() : ''}${members()}<section class="panel"><h3>出牌记录</h3><ul class="history">${[...view.history].reverse().map(h => `<li>${esc(h.message)}</li>`).join('')}</ul></section></aside></div>`;
}
function render() {
  if (!view) { app.innerHTML = entry(); bindEntry(); return; }
  const availableCards = view.me.isHost ? view.clues : view.me.hand;
  if (selectedCard && !availableCards.some(c => c.id === selectedCard)) selectedCard = null;
  app.innerHTML = `<div class="roombar"><div><h1>房间 <span class="roomcode">${view.code}</span>${view.round ? ` <small class="muted" style="font-size:14px">第 ${view.round} 局</small>` : ''}</h1><span id="connection" class="status ${connectionError ? 'error' : ''}" title="${esc(connectionError)}">${status}</span></div><div class="row"><button class="quiet" id="copy-code">复制房间码</button><button class="quiet" id="copy-link">邀请朋友</button></div></div>${view.phase === 'lobby' ? lobby() : game()}`;
  bindRoom();
}
function bindEntry() {
  for (const action of ['create', 'join']) document.querySelector(`#${action}-form`)?.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, data = new FormData(form), button = form.querySelector('button');
    busy = true; button.disabled = true; const text = button.textContent; button.textContent = '正在连接…';
    try { saveSession(await api({ action, name: data.get('name'), code: String(data.get('code') || '').trim().toUpperCase() }, null)); }
    catch (error) { toast(error.message); }
    finally { busy = false; button.disabled = false; button.textContent = text; }
  });
}
async function copy(value) {
  try { await navigator.clipboard.writeText(value); toast('已复制'); }
  catch { toast(`请手动复制：${value}`); }
}
function invite() { return `${location.origin}/rings/?room=${view.code}`; }
function rulesPayload() { return { action: 'rules', rules: ruleDraft || view.rules }; }
function bindRoom() {
  document.querySelector('#import-pack')?.addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 200000) { toast('文字牌组文件最多 200 KB，请不要嵌入图片'); event.target.value = ''; return; }
    let pack;
    try { pack = JSON.parse(await file.text()); } catch { toast('无法读取牌组，请选择有效的 JSON 文件'); event.target.value = ''; return; }
    await perform({ action: 'import', pack });
  });
  document.querySelector('#copy-code')?.addEventListener('click', () => copy(view.code));
  for (const id of ['copy-link', 'copy-invite']) document.querySelector(`#${id}`)?.addEventListener('click', () => copy(invite()));
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => perform({ action: button.dataset.action })));
  document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => perform({ action: 'remove', playerId: button.dataset.remove })));
  document.querySelectorAll('[data-rule]').forEach(input => input.addEventListener('input', () => { ruleDraft[input.dataset.rule][input.dataset.lang] = input.value; }));
  document.querySelector('#save-rules')?.addEventListener('click', () => perform(rulesPayload()));
  document.querySelector('#start-game')?.addEventListener('click', async () => {
    if (JSON.stringify(ruleDraft || view.rules) !== JSON.stringify(view.rules)) {
      await perform(rulesPayload());
      if (JSON.stringify(ruleDraft || view.rules) !== JSON.stringify(view.rules)) return;
    }
    await perform({ action: 'start' });
  });
  document.querySelectorAll('[data-card]').forEach(button => button.addEventListener('click', () => { selectedCard = button.dataset.card; render(); }));
  document.querySelectorAll('[data-region]').forEach(button => button.addEventListener('click', () => { selectedMask = Number(button.dataset.region); render(); }));
  document.querySelector('#place-card')?.addEventListener('click', () => perform({ action: view.phase === 'clues' ? 'clue' : 'play', cardId: selectedCard, mask: selectedMask }));
  document.querySelectorAll('[data-judge-bit]').forEach(input => input.addEventListener('change', () => {
    const bit = Number(input.dataset.judgeBit); judgeMask = input.checked ? judgeMask | bit : judgeMask & ~bit;
    document.querySelector('#judge-target').textContent = `正确区域：${regions[judgeMask].label}`;
    document.querySelector('#confirm-judge').textContent = judgeMask === view.pending.mask ? '位置正确，允许继续出牌' : '纠正位置，摸牌并换人';
  }));
  document.querySelector('#confirm-judge')?.addEventListener('click', () => perform({ action: 'judge', mask: judgeMask, pendingCardId: view.pending.card.id }));
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
if (session?.token && session?.code) { refresh(); } else { session = null; render(); }
