const $ = id => document.getElementById(id);
const guest = /^\/r\/([A-F0-9]{8})$/.exec(location.pathname);
let code = guest?.[1] ?? new URLSearchParams(location.search).get('room') ?? localStorage.getItem('nr_host_room'), state, meta, etag, busy = false, pending, returnFocus;
let serverTime = 0, receivedAt = 0, ownedRoom;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let shownQuestion, shownPodium;
const show = (id, visible) => { $(id).hidden = !visible; };
const say = (id, text) => { if ($(id).textContent !== text) $(id).textContent = text; };
const seconds = value => `${(value / 1000).toFixed(3)}s`;
function error(value) { $('error').textContent = value; show('error', Boolean(value)); }
async function api(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const value = await response.json();
  if (!response.ok) {
    if (value.code === 'AUTH') meta = await (await fetch('/api/meta')).json();
    throw new Error(value.error ?? `Request failed (${response.status}).`);
  }
  if (value.trace) $('trace').textContent = JSON.stringify(value.trace, null, 2);
  if (value.result?.room && value.isHost !== undefined) ownedRoom = value.isHost ? value.result.room.code : undefined;
  if (value.result?.room) accept(value.result);
  return value;
}
function accept(value) {
  if (state?.room.code === value.room.code && value.room.version < state.room.version) return;
  state = value; serverTime = value.room.serverNow; receivedAt = performance.now();
}
async function action(work) {
  if (busy) return;
  busy = true; error('');
  document.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try { await work(); }
  catch (failure) { error(failure instanceof Error ? failure.message : String(failure)); }
  finally { busy = false; render(); }
}
function car(hue) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 72 36'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('car');
  svg.style.color = `hsl(${hue} 75% 43%)`;
  for (const [tag, attributes] of [
    ['rect', { x: 4, y: 12, width: 64, height: 16, rx: 6, fill: 'currentColor' }],
    ['rect', { x: 17, y: 4, width: 36, height: 18, rx: 5, fill: 'currentColor' }],
    ['path', { d: 'M23 7h12v10H21zm15 0h10l4 10H38z', fill: '#fffbea' }],
    ['circle', { cx: 18, cy: 29, r: 6, fill: '#15203b', stroke: '#fffbea', 'stroke-width': 2 }],
    ['circle', { cx: 55, cy: 29, r: 6, fill: '#15203b', stroke: '#fffbea', 'stroke-width': 2 }],
  ]) {
    const shape = document.createElementNS(svg.namespaceURI, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, String(value));
    svg.append(shape);
  }
  return svg;
}
function track(player) {
  const card = document.createElement('div'); card.className = 'racer';
  const name = document.createElement('span'); name.className = 'racer-name'; name.textContent = player.name; name.title = player.name;
  const label = document.createElement('span'); label.className = 'racer-label'; label.textContent = player.label;
  const lane = document.createElement('div'); lane.className = 'lane';
  const runner = document.createElement('span'); runner.className = 'runner'; runner.append(car(player.colorHue)); runner.setAttribute('aria-hidden', 'true'); lane.append(runner);
  const progress = document.createElement('progress'); progress.max = 100; progress.value = 0; progress.setAttribute('aria-label', `${player.name} race progress`);
  card.append(name, label, lane, progress); card.dataset.player = player.id; return card;
}
function updateTracks(id, players) {
  const container = $(id), existing = new Map([...container.children].map(card => [card.dataset.player, card]));
  for (const player of players) {
    const card = existing.get(player.id) ?? track(player);
    existing.delete(player.id);
    card.querySelector('.racer-label').textContent = state.room.mode === 'quiz'
      ? `${player.label} / ${player.correctAnswers}/5 correct / ${player.score} points${state.room.phase === 'waiting' ? '' : ` / rank ${player.rank} / ${seconds(player.answerTimeMs)}`}`
      : player.label;
    container.append(card);
  }
  existing.forEach(card => card.remove());
}
function draw() {
  if (!state) return;
  const room = state.room;
  const elapsed = serverTime + performance.now() - receivedAt - (room.startedAt ?? Infinity);
  document.querySelectorAll('.racer').forEach(card => {
    const player = room.players.find(p => p.id === card.dataset.player);
    if (!player) return;
    let value = room.mode === 'quiz' ? player.correctAnswers * 20
      : player.durationMs ? Math.max(0, Math.min(100, elapsed / player.durationMs * 100)) : 0;
    if (room.mode === 'legacy' && reduced.matches) value = room.phase === 'finished' ? 100 : 0;
    if (room.phase === 'waiting') value = 0;
    const lane = card.querySelector('.lane'), runner = card.querySelector('.runner');
    runner.style.transform = `translateX(${Math.max(0, lane.clientWidth - 64) * value / 100}px)`;
    card.querySelector('progress').value = value;
  });
}
function renderQuestion(host, room) {
  const question = room.question;
  show('question-card', Boolean(question));
  if (!question) { shownQuestion = undefined; return; }
  say('question-number', `QUESTION ${question.number} / ${question.total}`);
  say('question-count', `${question.answerCount} / ${room.players.length} answered`);
  const identity = `${room.code}:${room.round}:${question.index}`;
  if (shownQuestion !== identity) {
    shownQuestion = identity; $('question-title').textContent = question.prompt;
    $('answer-options').replaceChildren(...question.options.map((option, choice) => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.choice = choice;
      button.textContent = `${'ABCD'[choice]}. ${option}`;
      button.onclick = () => { void action(async () => {
        await api('/api/answer', { code, round: room.round, questionIndex: question.index, choice });
        etag = undefined; await refresh(true);
      }); };
      return button;
    }));
    if (host || state.you) $('question-title').focus();
  }
  for (const button of $('answer-options').children) {
    const choice = Number(button.dataset.choice);
    button.disabled = busy || !guest || !state.you || question.closed || Boolean(state.answer);
    button.classList.toggle('selected', state.answer?.choice === choice);
    button.classList.toggle('correct', question.closed && question.correctChoice === choice);
    button.setAttribute('aria-pressed', String(state.answer?.choice === choice));
  }
  const feedback = question.closed ? state.answer
    ? state.answer.correct ? 'Correct! Your car moves forward. +100 points.' : 'Not this time. No points for this answer.'
    : host ? question.number === 5 ? 'Quiz finished. Show the final leaderboard and podium.' : 'Answers are closed. Explain the result, then open the next question.' : 'No answer was saved. No points for this question.'
    : state.answer ? `Answer ${'ABCD'[state.answer.choice]} saved. Wait for the host to reveal the result.`
      : host ? 'Participants answer on their phones. Close answers when you are ready.'
        : state.you ? 'Your choice is final after you tap. Pick one answer.'
          : 'This quiz has started. Join before the next round to answer.';
  say('answer-feedback', feedback);
  show('explanation', question.closed);
  $('explanation').textContent = question.closed ? `Answer ${'ABCD'[question.correctChoice]}: ${question.options[question.correctChoice]}. ${question.explanation}` : '';
  const previous = room.previousQuestion;
  show('previous-result', Boolean(previous && !question.closed));
  say('previous-result', previous ? `Question ${previous.number} result: ${'ABCD'[previous.correctChoice]}. ${previous.options[previous.correctChoice]}. ${previous.explanation}` : '');
  show('question-controls', host && room.phase === 'running');
  $('question-controls').setAttribute('aria-busy', String(busy));
  $('close-question').disabled = busy || question.closed;
  $('close-question').textContent = question.number === 5 ? 'Close question & show podium' : 'Close & open next question';
  show('next-question', question.closed && question.number < 5);
  $('next-question').disabled = busy || !question.closed || question.number === 5;
  $('next-question').textContent = `Open question ${Math.min(5, question.number + 1)}`;
}
function renderLeaderboard(room, players) {
  show('leaderboard-section', room.mode === 'quiz' && room.phase !== 'waiting');
  $('leaderboard').replaceChildren(...players.map(player => {
    const row = document.createElement('tr');
    if (player.id === state.you) row.className = 'your-standing';
    for (const value of [`#${player.rank}`, player.name, String(player.score), seconds(player.answerTimeMs)]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    return row;
  }));
}
function renderPodium(room, players) {
  const visible = room.mode === 'quiz' && room.phase === 'finished';
  show('podium-section', visible);
  if (!visible) { shownPodium = undefined; return; }
  const leaders = players.slice(0, 3);
  const identity = JSON.stringify([room.code, room.round, leaders]);
  if (identity === shownPodium) return;
  shownPodium = identity;
  $('podium').replaceChildren(...leaders.map((player, index) => {
    const place = document.createElement('article'); place.className = 'podium-place'; place.dataset.slot = index; place.dataset.rank = player.rank;
    const rank = document.createElement('strong'); rank.className = 'podium-rank'; rank.textContent = `#${player.rank}`;
    const name = document.createElement('h3'); name.textContent = player.name;
    const score = document.createElement('p'); score.textContent = `${player.score} points / ${player.correctAnswers}/5 correct`;
    const time = document.createElement('p'); time.className = 'small'; time.textContent = `${seconds(player.answerTimeMs)} total correct-answer time`;
    place.append(rank, car(player.colorHue), name, score, time); return place;
  }));
  say('podium-announcement', `Top racers: ${leaders.map(p => `${p.name}, rank ${p.rank}, ${p.score} points`).join('; ')}. Equal score and time share a rank.`);
}
function render() {
  document.querySelectorAll('button').forEach(b => { b.disabled = busy; });
  if (!meta) return;
  $('mode').textContent = `REAL MCP / AI ${meta.ai ? 'ON' : 'OFF'}`;
  show('login', !guest && !meta.authenticated);
  show('create', !guest && meta.authenticated && (!state || (meta.hostMode === 'browser' && ownedRoom !== state.room.code)));
  show('game', Boolean(state));
  if (!state) { shownQuestion = undefined; shownPodium = undefined; return; }
  const room = state.room, host = !guest && meta.authenticated && (meta.hostMode !== 'browser' || ownedRoom === room.code);
  show('host-notice', !guest && meta.hostMode === 'browser' && !host);
  $('room-title').textContent = `Room ${room.code} / Round ${room.round || 1}`;
  $('count').textContent = `${room.players.length} / ${room.capacity} racers`;
  const quiz = room.mode === 'quiz';
  say('status', room.phase === 'waiting' ? 'The room is open. Pick a nickname. The host will start five questions.'
    : quiz ? room.phase === 'finished' ? 'The quiz is finished! Meet the top racers on the podium.'
      : `Question ${room.question?.number} is ${room.question?.closed ? 'closed. The host will open the next question.' : 'open. Answer on your phone.'}`
      : room.phase === 'running' ? 'This previous random race is running. Reset after it finishes to use the quiz.' : 'The previous race finished. Reset to use the quiz.');
  $('rules').textContent = quiz || room.phase === 'waiting'
    ? 'Ranking uses correct answers first, then total time for correct answers. Time is recorded by the server and includes network and polling delay. Exact score/time ties share a rank.'
    : 'This previous room uses a random finish order. Reset keeps the nicknames and upgrades it to the five-question quiz.';
  show('invite-card', host && room.phase === 'waiting');
  const qrPath = `/api/qr/${room.code}`; if (host && $('qr').getAttribute('src') !== qrPath) $('qr').src = qrPath;
  show('join-card', Boolean(guest && !state.you && room.phase === 'waiting'));
  show('host-controls', host); show('commentator', host); $('comment').disabled = busy || !meta.ai;
  $('start').disabled = busy || room.phase !== 'waiting' || room.players.length < 1;
  $('reset').disabled = busy || room.phase !== 'finished';
  const winner = room.players.find(p => p.id === room.winnerId);
  show('winner', Boolean(winner) || (quiz && room.phase === 'finished'));
  const joint = quiz ? room.players.filter(p => p.rank === 1 && p.score > 0) : [];
  $('winner').textContent = quiz && room.phase === 'finished' ? joint.length
    ? `${joint.map(p => p.name).join(' & ')} ${joint.length === 1 ? 'wins' : 'share first place'}!`
    : 'Quiz finished. No correct answers this round.' : winner ? `${winner.name} wins!` : '';
  const own = room.players.find(p => p.id === state.you);
  show('your-racer', Boolean(own)); updateTracks('your-track', own ? [own] : []);
  const players = room.phase === 'waiting' ? [...room.players].reverse()
    : [...room.players].sort((a, b) => quiz ? a.rank - b.rank : a.durationMs - b.durationMs);
  $('track-label').textContent = room.phase === 'waiting' ? 'Latest arrivals' : 'Leading cars';
  updateTracks('tracks', players.slice(0, 12));
  renderQuestion(host, room); renderLeaderboard(room, players); renderPodium(room, players);
  $('names').replaceChildren(...room.players.map(player => {
    const item = document.createElement('li'), name = document.createElement('span');
    name.textContent = `${player.label}: ${player.name}${quiz && room.phase !== 'waiting' ? ` / ${player.score} points / rank ${player.rank}` : ''}`; item.append(name);
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
  const requestedCode = code;
  const response = await fetch(`/api/room/${requestedCode}`, { headers: !force && etag ? { 'If-None-Match': etag } : {} });
  if (requestedCode !== code) return;
  if (response.status === 304) return;
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 404) { state = undefined; code = undefined; etag = undefined; if (!guest) localStorage.removeItem('nr_host_room'); render(); }
    throw new Error(value.error ?? 'Room read failed.');
  }
  if (state?.room.code === value.result.room.code && value.result.room.version < state.room.version) return;
  ownedRoom = value.isHost ? value.result.room.code : undefined;
  accept(value.result); etag = response.headers.get('etag'); render();
}
function review(word, playerId) {
  pending = { word, playerId, version: state.room.controlVersion };
  returnFocus = document.activeElement;
  $('required-word').textContent = word; $('confirmation').value = '';
  $('review-title').textContent = word === 'START' ? 'Start the five-question quiz?' : word === 'CLOSE' ? 'Close answers and reveal the result?'
    : word === 'NEXT' ? 'Open the next question?' : word === 'DELETE' ? 'Delete this room and its nicknames?' : word === 'REMOVE' ? 'Remove this entry?' : 'Open the next round?';
  $('review-copy').textContent = word === 'START' ? `${state.room.players.length} ${state.room.players.length === 1 ? 'racer' : 'racers'}. Correct answers earn points. Faster correct answers break score ties. Joining closes.`
    : word === 'CLOSE' ? `${state.room.question.answerCount} / ${state.room.players.length} answered question ${state.room.question.number}. Unanswered entries get zero points. Late answers will be rejected.`
      : word === 'NEXT' ? 'The next question opens for everyone. Its answer clock starts on the server.'
        : word === 'DELETE' ? 'The link will stop working. Registered nicknames will be removed.'
          : word === 'RESET' ? 'Keep the nicknames, clear all scores, and reopen the room.' : 'Only the host can approve this action.';
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
    if (selected.word === 'DELETE') {
      state = undefined; code = undefined; etag = undefined; localStorage.removeItem('nr_host_room');
      const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url);
    }
    else await refresh(true);
  });
};
$('login-form').onsubmit = event => { event.preventDefault(); void action(async () => {
  await api('/api/login', { password: $('password').value }); $('password').value = '';
  meta = await (await fetch('/api/meta')).json(); if (code) await refresh(true);
}); };
$('create-room').onclick = () => { void action(async () => {
  const value = await api('/api/create', {}); code = value.result.room.code; localStorage.setItem('nr_host_room', code); etag = undefined;
  const url = new URL(location.href); url.searchParams.set('room', code); history.replaceState(null, '', url);
  await refresh(true); $('room-title').focus();
}); };
$('join-form').onsubmit = event => { event.preventDefault(); void action(async () => {
  await api('/api/join', { code, name: $('nickname').value, consent: $('consent').checked }); await refresh(true); $('room-title').focus();
}); };
$('start').onclick = () => review('START'); $('reset').onclick = () => review('RESET'); $('delete').onclick = () => review('DELETE');
function controlQuestion(confirmation) {
  const expectedVersion = state.room.controlVersion;
  void action(async () => {
    await api('/api/control', { code, expectedVersion, confirmation });
    etag = undefined; await refresh(true);
  });
}
$('close-question').onclick = () => controlQuestion('CLOSE_NEXT');
$('next-question').onclick = () => controlQuestion('NEXT');
$('comment').onclick = () => { void action(async () => { $('commentary').textContent = 'Reading the actual race...'; try {
  const value = await api('/api/commentary', { code }); $('commentary').textContent = value.reply;
} catch (failure) { $('commentary').textContent = 'Commentary failed. Try again after the result is stable.'; throw failure; } }); };
try { const response = await fetch('/api/meta'); if (!response.ok) throw new Error('Connection failed.'); meta = await response.json(); await refresh(); render(); }
catch (failure) { error(failure instanceof Error ? failure.message : String(failure)); render(); }
setInterval(() => { if (code && !busy) void refresh().catch(failure => error(failure.message)); }, 2000);
setInterval(draw, 100);
reduced.addEventListener('change', draw);
