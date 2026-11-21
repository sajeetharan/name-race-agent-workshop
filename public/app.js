const $ = id => document.getElementById(id);
const guest = /^\/r\/([A-F0-9]{8})$/.exec(location.pathname);
let code = guest?.[1] ?? new URLSearchParams(location.search).get('room') ?? localStorage.getItem('nr_host_room'), state, meta, etag, busy = false, pending, returnFocus;
let serverTime = 0, receivedAt = 0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const show = (id, visible) => { $(id).hidden = !visible; };
function error(value) { $('error').textContent = value; show('error', Boolean(value)); }
async function api(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const value = await response.json();
  if (!response.ok) {
    if (value.code === 'AUTH') meta = await (await fetch('/api/meta')).json();
    throw new Error(value.error ?? `Request failed (${response.status}).`);
  }
  if (value.trace) $('trace').textContent = JSON.stringify(value.trace, null, 2);
  return value;
}
async function action(work) {
  if (busy) return;
  busy = true; error('');
  document.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try { await work(); }
  catch (failure) { error(failure instanceof Error ? failure.message : String(failure)); }
  finally { busy = false; render(); }
}
function track(player) {
  const card = document.createElement('div'); card.className = 'racer';
  const name = document.createElement('span'); name.className = 'racer-name'; name.textContent = player.name; name.title = player.name;
  const label = document.createElement('span'); label.className = 'racer-label'; label.textContent = player.label;
  const lane = document.createElement('div'); lane.className = 'lane';
  const runner = document.createElement('span'); runner.className = 'runner'; runner.textContent = player.label.replace('Racer ', '#'); runner.setAttribute('aria-hidden', 'true'); lane.append(runner);
  const progress = document.createElement('progress'); progress.max = 100; progress.value = 0; progress.setAttribute('aria-label', `${player.name} race progress`);
  card.append(name, label, lane, progress); card.dataset.player = player.id; return card;
}
function draw() {
  if (!state) return;
  const room = state.room;
  const elapsed = serverTime + performance.now() - receivedAt - (room.startedAt ?? Infinity);
  document.querySelectorAll('.racer').forEach(card => {
    const player = room.players.find(p => p.id === card.dataset.player);
    if (!player) return;
    let value = player.durationMs ? Math.max(0, Math.min(100, elapsed / player.durationMs * 100)) : 0;
    if (reduced.matches) value = room.phase === 'finished' ? 100 : 0;
    else if (room.phase === 'waiting') value = 0;
    const lane = card.querySelector('.lane'), runner = card.querySelector('.runner');
    runner.style.transform = `translateX(${Math.max(0, lane.clientWidth - 64) * value / 100}px)`;
    card.querySelector('progress').value = value;
  });
}
function render() {
  document.querySelectorAll('button').forEach(b => { b.disabled = busy; });
  if (!meta) return;
  $('mode').textContent = `REAL MCP / AI ${meta.ai ? 'ON' : 'OFF'}`;
  show('login', !guest && !meta.authenticated);
  show('create', !guest && meta.authenticated && !state);
  show('game', Boolean(state));
  if (!state) return;
  const room = state.room, host = !guest && meta.authenticated;
  $('room-title').textContent = `Room ${room.code} / Round ${room.round || 1}`;
  $('count').textContent = `${room.players.length} / ${room.capacity} racers`;
  $('status').textContent = room.phase === 'waiting' ? 'The room is open. Pick a nickname and get ready.'
    : room.phase === 'running' ? 'The race is on! Joining is closed. Watch the finish line.' : 'We have a winner! The host can open another round.';
  show('invite-card', host);
  $('invite-link').textContent = `${location.origin}/r/${room.code}`; $('invite-link').href = `${location.origin}/r/${room.code}`;
  const qrPath = `/api/qr/${room.code}`; if (host && $('qr').getAttribute('src') !== qrPath) $('qr').src = qrPath;
  show('join-card', Boolean(guest && !state.you && room.phase === 'waiting'));
  show('host-controls', host); show('commentator', host); $('comment').disabled = busy || !meta.ai;
  $('start').disabled = busy || room.phase !== 'waiting' || room.players.length < 1;
  $('reset').disabled = busy || room.phase !== 'finished';
  const winner = room.players.find(p => p.id === room.winnerId);
  show('winner', Boolean(winner)); $('winner').textContent = winner ? `${winner.name} wins!` : '';
  const own = room.players.find(p => p.id === state.you);
  show('your-racer', Boolean(own)); $('your-track').replaceChildren(...(own ? [track(own)] : []));
  const players = room.phase === 'waiting' ? [...room.players].reverse()
    : [...room.players].sort((a, b) => a.durationMs - b.durationMs);
  $('track-label').textContent = room.phase === 'waiting' ? 'Latest arrivals' : 'Leading racers';
  $('tracks').replaceChildren(...players.slice(0, 12).map(track));
  $('names').replaceChildren(...room.players.map(player => {
    const item = document.createElement('li'), name = document.createElement('span'); name.textContent = `${player.label}: ${player.name}`; item.append(name);
    if (host && room.phase === 'waiting') {
      const remove = document.createElement('button'); remove.className = 'secondary'; remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${player.name}`); remove.disabled = busy;
      remove.onclick = () => review('REMOVE', player.id); item.append(remove);
    }
    return item;
  }));
  draw();
}
async function refresh(force = false) {
  if (!code) return;
  const response = await fetch(`/api/room/${code}`, { headers: !force && etag ? { 'If-None-Match': etag } : {} });
  if (response.status === 304) return;
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 404) { state = undefined; code = undefined; etag = undefined; if (!guest) localStorage.removeItem('nr_host_room'); render(); }
    throw new Error(value.error ?? 'Room read failed.');
  }
  state = value.result; etag = response.headers.get('etag'); serverTime = state.room.serverNow; receivedAt = performance.now(); render();
}
function review(word, playerId) {
  pending = { word, playerId, version: state.room.version };
  returnFocus = document.activeElement;
  $('required-word').textContent = word; $('confirmation').value = '';
  $('review-title').textContent = word === 'START' ? 'Start this random race?' : word === 'DELETE' ? 'Delete this room and its nicknames?' : word === 'REMOVE' ? 'Remove this entry?' : 'Open the next round?';
  $('review-copy').textContent = word === 'START' ? `${state.room.players.length} ${state.room.players.length === 1 ? 'racer' : 'racers'}. Eight seconds. Code picks a random finish order. Joining closes.`
    : word === 'DELETE' ? 'The link will stop working. Registered nicknames will be removed.' : 'Only the host can approve this action.';
  $('review').showModal(); $('confirmation').focus();
}
function closeReview() { $('review').close(); returnFocus?.focus(); }
$('cancel').onclick = closeReview;
$('review').addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeReview(); } });
$('review-form').onsubmit = event => {
  event.preventDefault();
  if ($('confirmation').value !== pending.word) { error(`Type ${pending.word} exactly.`); return; }
  const selected = pending; closeReview();
  void action(async () => {
    await api(selected.word === 'DELETE' ? '/api/delete' : '/api/control', {
      code, expectedVersion: selected.version, confirmation: selected.word, ...(selected.playerId ? { playerId: selected.playerId } : {}),
    });
    if (selected.word === 'DELETE') { state = undefined; code = undefined; etag = undefined; localStorage.removeItem('nr_host_room'); }
    else await refresh(true);
  });
};
$('login-form').onsubmit = event => { event.preventDefault(); void action(async () => {
  await api('/api/login', { password: $('password').value }); $('password').value = '';
  meta = await (await fetch('/api/meta')).json(); if (code) await refresh(true);
}); };
$('create-room').onclick = () => { void action(async () => {
  const value = await api('/api/create', {}); code = value.result.room.code; localStorage.setItem('nr_host_room', code); await refresh(true); $('room-title').focus();
}); };
$('join-form').onsubmit = event => { event.preventDefault(); void action(async () => {
  await api('/api/join', { code, name: $('nickname').value, consent: $('consent').checked }); await refresh(true); $('room-title').focus();
}); };
$('start').onclick = () => review('START'); $('reset').onclick = () => review('RESET'); $('delete').onclick = () => review('DELETE');
$('comment').onclick = () => { void action(async () => { $('commentary').textContent = 'Reading the actual race...'; const value = await api('/api/commentary', { code }); $('commentary').textContent = value.reply; }); };
try { const response = await fetch('/api/meta'); if (!response.ok) throw new Error('Connection failed.'); meta = await response.json(); await refresh(); render(); }
catch (failure) { error(failure instanceof Error ? failure.message : String(failure)); render(); }
setInterval(() => { if (code && !busy) void refresh().catch(failure => error(failure.message)); }, 2000);
setInterval(draw, 100);
reduced.addEventListener('change', draw);
