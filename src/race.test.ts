import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectRace } from './connection.ts';
import { FileRepository, MemoryRepository, outcomeSchema, RaceStore, summarySchema } from './race.ts';
import { fiveQuestions, questions } from './questions.ts';
const key = (n: number) => n.toString(16).padStart(64, '0');

test('120 concurrent registrations have unique entries; the 121st fails without mutation', async () => {
  const store = new RaceStore(new MemoryRepository());
  const { room } = await store.create();
  await Promise.all(Array.from({ length: 120 }, (_, i) => store.join(room.code, `Player ${i}`, key(i + 1), true)));
  const state = await store.read(room.code);
  assert.equal(state.room.players.length, 120); assert.equal(new Set(state.room.players.map(p => p.id)).size, 120);
  await assert.rejects(store.join(room.code, 'Extra', key(121), true), /120 racers/);
  assert.equal((await store.read(room.code)).room.version, state.room.version);
  const same = await store.join(room.code, 'Player 0', key(1), true);
  assert.equal(same.room.version, state.room.version);
  assert.ok(same.you); assert.ok(!JSON.stringify(same).includes('keyHash'));
});
test('empty rooms cannot start; one racer can answer all three host-paced questions', async () => {
  let now = 100000;
  const store = new RaceStore(new MemoryRepository(), () => now);
  let { room } = await store.create();
  await assert.rejects(store.control(room.code, room.version, 'START'), /at least one racer/);
  assert.equal((await store.read(room.code)).room.version, room.version);
  const joined = await store.join(room.code, 'Solo Panda', key(1), true);
  room = (await store.control(room.code, joined.room.controlVersion, 'START')).room;
  for (let index = 0; index < questions.length; index++) {
    now += 250;
    const receivedAt = now;
    now += 1000;
    await store.answer(room.code, key(1), room.round, index, questions[index]!.correctChoice, receivedAt);
    assert.equal((await store.read(room.code)).room.players[0]?.score, index * 100);
    room = (await store.control(room.code, room.controlVersion, 'CLOSE')).room;
    assert.equal(room.players[0]?.score, (index + 1) * 100);
    if (index < questions.length - 1) room = (await store.control(room.code, room.controlVersion, 'NEXT')).room;
  }
  assert.equal(room.phase, 'finished'); assert.equal(room.players[0]?.answerTimeMs, 750);
  assert.equal(room.winnerId, joined.you);
  room = (await store.control(room.code, room.controlVersion, 'RESET')).room;
  assert.equal(room.phase, 'waiting');
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0]?.durationMs, null);
  assert.equal(room.players[0]?.score, 0); assert.equal(room.question, null);
  await assert.rejects(store.answer(room.code, key(1), 1, 2, questions[2].correctChoice), /not open/);
});
test('quiz scoring, speed ties, private answers and question boundaries are code owned', async () => {
  let now = 100000;
  const store = new RaceStore(new MemoryRepository(), () => now);
  let { room } = await store.create();
  await store.join(room.code, 'नेपाल', key(1), true);
  room = (await store.join(room.code, 'Blue Panda', key(2), true)).room;
  room = (await store.join(room.code, 'Fast Cat', key(3), true)).room;
  room = (await store.join(room.code, 'Tie Bird', key(4), true)).room;
  await assert.rejects(store.join(room.code, 'blue panda', key(5), true), /taken/);
  await assert.rejects(store.join(room.code, '<script>', key(5), true));
  await assert.rejects(store.control(room.code, 1, 'START'), /changed/);
  room = (await store.control(room.code, room.controlVersion, 'START')).room;
  assert.equal(room.winnerId, null);
  await assert.rejects(store.join(room.code, 'Late', key(5), true), /closed/);
  await assert.rejects(store.control(room.code, room.controlVersion, 'RESET'), /Finish/);
  await assert.rejects(store.control(room.code, room.controlVersion, 'NEXT'), /Close/);
  await assert.rejects(store.answer(room.code, key(99), room.round, 0, 1), /Join/);
  for (let index = 0; index < questions.length; index++) {
    const start = now;
    const correct = questions[index]!.correctChoice;
    now = start + 50;
    await store.answer(room.code, key(3), room.round, index, index === questions.length - 1 ? (correct + 1) % 4 : correct);
    now = start + 100;
    const answer = await store.answer(room.code, key(2), room.round, index, correct);
    await store.answer(room.code, key(4), room.round, index, correct);
    assert.equal(answer.answer?.correct, null); assert.equal(answer.room.question?.correctChoice, null);
    const revision = (await store.read(room.code)).room.version;
    assert.equal((await store.answer(room.code, key(2), room.round, index, correct)).room.version, revision);
    await assert.rejects(store.answer(room.code, key(2), room.round, index, (correct + 1) % 4), /cannot change/);
    now = start + 400;
    await store.answer(room.code, key(1), room.round, index, correct);
    room = (await store.control(room.code, room.controlVersion, 'CLOSE')).room;
    assert.equal((await store.read(room.code, key(2))).answer?.correct, true);
    assert.equal((await store.read(room.code)).answer, null);
    await assert.rejects(store.control(room.code, room.controlVersion, 'CLOSE'), /Open a question/);
    if (index < questions.length - 1) {
      room = (await store.control(room.code, room.controlVersion, 'NEXT')).room;
      await assert.rejects(store.answer(room.code, key(1), room.round + 1, index + 1, 0), /round changed/i);
    }
  }
  assert.equal(room.phase, 'finished'); assert.ok(room.winnerId);
  const panda = room.players.find(p => p.name === 'Blue Panda')!;
  const tie = room.players.find(p => p.name === 'Tie Bird')!;
  const slow = room.players.find(p => p.name === 'नेपाल')!;
  const fastWrong = room.players.find(p => p.name === 'Fast Cat')!;
  assert.equal(panda.score, 300); assert.equal(panda.rank, 1); assert.equal(tie.rank, 1);
  assert.equal(slow.rank, 3); assert.equal(fastWrong.score, 200); assert.equal(fastWrong.rank, 4);
  assert.equal(new Set(room.players.map(p => p.colorHue)).size, 4);
  const winner = room.winnerId;
  assert.equal((await store.read(room.code)).room.winnerId, winner);
  const summary = await store.summary(room.code);
  assert.ok(!JSON.stringify(summary).includes('नेपाल')); assert.ok(!JSON.stringify(summary).includes('Blue Panda'));
  room = (await store.control(room.code, room.controlVersion, 'RESET')).room;
  assert.equal(room.phase, 'waiting'); assert.equal(room.players.length, 4); assert.equal(room.winnerId, null);
});
test('one host click closes and advances atomically, keeps next grades private and finishes the podium', async () => {
  let now = 100000;
  const store = new RaceStore(new MemoryRepository(), () => now);
  let { room } = await store.create();
  const joined = await store.join(room.code, 'Plan Panda', key(1), true);
  room = (await store.join(room.code, 'Late Bird', key(2), true)).room;
  await assert.rejects(store.control(room.code, room.controlVersion, 'CLOSE_NEXT'), /Open a question/);
  room = (await store.control(room.code, room.controlVersion, 'START')).room;
  assert.equal(room.questionTotal, 3);
  assert.equal(room.question?.total, 3);
  assert.equal(room.previousQuestion, null);
  await assert.rejects(store.answer(room.code, key(2), room.round, 3, 0), /not open/);
  await assert.rejects(store.answer(room.code, key(2), room.round, 4, 0), /not open/);
  for (let index = 0; index < questions.length; index++) {
    const version = room.controlVersion;
    now += 100;
    const submitted = await store.answer(room.code, key(1), room.round, index, questions[index]!.correctChoice);
    assert.equal(submitted.answer?.correct, null);
    assert.equal(submitted.room.players[0]?.score, index * 100);
    assert.equal(submitted.room.controlVersion, version);
    now += 50;
    room = (await store.control(room.code, version, 'CLOSE_NEXT')).room;
    assert.equal(room.controlVersion, version + 1);
    assert.equal(room.players[0]?.score, (index + 1) * 100);
    assert.equal(room.players[0]?.rank, 1);
    assert.equal(room.players[1]?.score, 0);
    await assert.rejects(store.control(room.code, version, 'CLOSE_NEXT'), /changed/);
    await assert.rejects(store.answer(room.code, key(2), room.round, index, questions[index]!.correctChoice), /not open/);
    if (index < questions.length - 1) {
      assert.equal(room.phase, 'running');
      assert.equal(room.question?.index, index + 1);
      assert.equal(room.question?.openedAt, now);
      assert.equal(room.question?.answerCount, 0);
      assert.equal(room.question?.closed, false);
      assert.equal(room.question?.correctChoice, null);
      assert.equal(room.question?.explanation, null);
      assert.equal(room.previousQuestion?.number, index + 1);
      assert.equal(room.previousQuestion?.correctChoice, questions[index]!.correctChoice);
    }
  }
  assert.equal(room.phase, 'finished');
  assert.equal(room.question?.number, 3);
  assert.equal(room.question?.closed, true);
  assert.equal(room.players[0]?.score, 300);
  assert.equal(room.winnerId, joined.you);
  await assert.rejects(store.control(room.code, room.controlVersion, 'CLOSE_NEXT'), /Open a question/);
  await assert.rejects(store.control(room.code, room.controlVersion, 'NEXT'), /Close this question/);
  assert.equal((await store.read(room.code)).room.controlVersion, room.controlVersion);
  room = (await store.control(room.code, room.controlVersion, 'RESET')).room;
  assert.equal(room.previousQuestion, null);
  assert.equal(room.players[0]?.score, 0);
});
test('persisted five-question rounds finish with their original answers, then reset to three', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'name-race-five-question-'));
  let now = 100000;
  try {
    let store = new RaceStore(new FileRepository(dir), () => now);
    let { room } = await store.create();
    room = (await store.join(room.code, 'Existing Panda', key(1), true)).room;
    const path = join(dir, `${room.code}.json`);
    const saved = JSON.parse(await readFile(path, 'utf8'));
    delete saved.questionTotal;
    Object.assign(saved, { phase: 'running', round: 1, questionIndex: 2, questionState: 'open',
      startedAt: now, questionOpenedAt: now });
    saved.players[0].answers = [0, 1].map(index => ({
      questionIndex: index, choice: fiveQuestions[index]!.correctChoice, correct: true, elapsedMs: 100,
    }));
    await writeFile(path, JSON.stringify(saved));
    for (let index = 2; index < fiveQuestions.length; index++) {
      store = new RaceStore(new FileRepository(dir), () => now);
      room = (await store.read(room.code)).room;
      assert.equal(room.questionTotal, 5);
      assert.equal(room.question?.total, 5);
      assert.equal(room.question?.prompt, fiveQuestions[index]!.prompt);
      now += 100;
      await store.answer(room.code, key(1), room.round, index, fiveQuestions[index]!.correctChoice);
      room = (await store.control(room.code, room.controlVersion, 'CLOSE_NEXT')).room;
      assert.equal(room.phase, index === 4 ? 'finished' : 'running');
    }
    assert.equal(room.players[0]?.score, 500);
    assert.ok(room.winnerId);
    room = (await store.control(room.code, room.controlVersion, 'RESET')).room;
    assert.equal(room.questionTotal, 3);
    assert.equal(room.players[0]?.name, 'Existing Panda');
    assert.equal(room.players[0]?.score, 0);
    store = new RaceStore(new FileRepository(dir), () => now);
    room = (await store.control(room.code, room.controlVersion, 'START')).room;
    for (let index = 0; index < 3; index++) {
      assert.equal(room.question?.total, 3);
      assert.equal(room.question?.prompt, questions[index]!.prompt);
      now += 100;
      await store.answer(room.code, key(1), room.round, index, questions[index]!.correctChoice);
      room = (await store.control(room.code, room.controlVersion, 'CLOSE_NEXT')).room;
    }
    assert.equal(room.phase, 'finished');
    assert.equal(room.players[0]?.score, 300);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('file-backed MCP survives reconnect, serializes joins, hides proofs and enforces host authority', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'name-race-mcp-'));
  let connection = await connectRace(dir);
  try {
    let outcome = (await connection.call('create_room', {}, outcomeSchema)).result;
    const code = outcome.room.code;
    await Promise.all(Array.from({ length: 120 }, (_, i) =>
      connection.call('join_room', { code, name: `RacerName${i}`, viewerKey: key(i + 1), consent: true }, outcomeSchema)));
    const read = await connection.call('read_room', { code, viewerKey: key(1) }, outcomeSchema);
    assert.equal(read.result.room.players.length, 120);
    assert.ok(!JSON.stringify(read.trace).includes(key(1)));
    const denied = await connection.client.callTool({ name: 'host_control', arguments: {
      code, expectedVersion: read.result.room.version, confirmation: 'START', authority: key(99),
    } });
    assert.equal(denied.isError, true);
    await connection.close(); connection = await connectRace(dir);
    outcome = (await connection.call('read_room', { code, viewerKey: key(1) }, outcomeSchema)).result;
    assert.equal(outcome.room.players.length, 120); assert.equal(outcome.you, read.result.you);
    const summary = await connection.call('read_race_summary', { code }, summarySchema);
    assert.equal(summary.result.count, 120); assert.ok(!JSON.stringify(summary).includes('RacerName'));
    outcome = (await connection.call('host_control', { code, expectedVersion: outcome.room.controlVersion, confirmation: 'START' }, outcomeSchema)).result;
    await Promise.all(Array.from({ length: 120 }, (_, i) => connection.call('submit_answer', {
      code, viewerKey: key(i + 1), round: outcome.room.round, questionIndex: 0, choice: questions[0].correctChoice,
    }, outcomeSchema)));
    await connection.close(); connection = await connectRace(dir);
    const answered = (await connection.call('read_room', { code, viewerKey: key(1) }, outcomeSchema)).result;
    assert.equal(answered.room.question?.answerCount, 120); assert.equal(answered.room.players[0]?.score, 0);
    assert.equal(answered.answer?.correct, null); assert.ok(!JSON.stringify(answered).includes('elapsedMs'));
    outcome = (await connection.call('host_control', { code, expectedVersion: outcome.room.controlVersion, confirmation: 'CLOSE_NEXT' }, outcomeSchema)).result;
    assert.ok(outcome.room.players.every(p => p.score === 100));
    assert.equal(outcome.room.question?.number, 2);
    assert.equal(outcome.room.question?.correctChoice, null);
    assert.equal(outcome.room.previousQuestion?.number, 1);
    await connection.call('delete_room', { code, expectedVersion: outcome.room.controlVersion, confirmation: 'DELETE' },
      (await import('zod')).z.object({ deleted: (await import('zod')).z.literal(true) }));
    await assert.rejects(readFile(join(dir, `${code}.json`)), /ENOENT/);
  } finally { await connection.close(); await rm(dir, { recursive: true, force: true }); }
});
test('legacy persisted rooms remain readable and reset into a quiz without losing names', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'name-race-legacy-'));
  try {
    const id = '00000000-0000-4000-8000-000000000001', code = 'AABBCCDD';
    await writeFile(join(dir, `${code}.json`), JSON.stringify({
      code, version: 4, round: 1, phase: 'running', startedAt: 1000, expiresAt: 100000,
      winnerId: id, nextLabel: 2, players: [{ id, label: 'Racer 1', name: 'Old Racer', durationMs: 8000, keyHash: key(1) }],
    }));
    const store = new RaceStore(new FileRepository(dir), () => 10000);
    const old = await store.read(code);
    assert.equal(old.room.mode, 'legacy'); assert.equal(old.room.phase, 'finished'); assert.equal(old.room.winnerId, id);
    const reset = await store.control(code, old.room.controlVersion, 'RESET');
    assert.equal(reset.room.mode, 'quiz'); assert.equal(reset.room.players[0]?.name, 'Old Racer');
    const started = await store.control(code, reset.room.controlVersion, 'START');
    assert.equal(started.room.question?.number, 1); assert.equal(started.room.players[0]?.score, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('corrupt persisted room fails explicitly; expired rooms cannot be read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'name-race-file-'));
  try {
    let now = 1000;
    const store = new RaceStore(new FileRepository(dir), () => now);
    const { room } = await store.create();
    now += 7200000; await assert.rejects(store.read(room.code), /expired/);
    await writeFile(join(dir, `${room.code}.json`), '{not-json');
    await assert.rejects(store.read(room.code), /damaged/);
    assert.equal(await readFile(join(dir, `${room.code}.json`), 'utf8'), '{not-json');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
