import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectRace } from './connection.ts';
import { FileRepository, MemoryRepository, outcomeSchema, RaceStore, summarySchema } from './race.ts';
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
test('names, stale controls, random finish and next-round boundaries are code owned', async () => {
  let now = 100000;
  const store = new RaceStore(new MemoryRepository(), () => now, () => 0);
  let { room } = await store.create();
  await store.join(room.code, 'नेपाल', key(1), true);
  room = (await store.join(room.code, 'Blue Panda', key(2), true)).room;
  await assert.rejects(store.join(room.code, 'blue panda', key(3), true), /taken/);
  await assert.rejects(store.join(room.code, '<script>', key(3), true));
  await assert.rejects(store.control(room.code, 1, 'START'), /changed/);
  room = (await store.control(room.code, room.version, 'START')).room;
  assert.equal(room.winnerId, null);
  await assert.rejects(store.join(room.code, 'Late', key(3), true), /closed/);
  await assert.rejects(store.control(room.code, room.version, 'RESET'), /Finish/);
  now += 10500;
  room = (await store.read(room.code)).room;
  assert.equal(room.phase, 'finished'); assert.ok(room.winnerId);
  const winner = room.winnerId;
  assert.equal((await store.read(room.code)).room.winnerId, winner);
  const summary = await store.summary(room.code);
  assert.ok(!JSON.stringify(summary).includes('नेपाल')); assert.ok(!JSON.stringify(summary).includes('Blue Panda'));
  room = (await store.control(room.code, room.version, 'RESET')).room;
  assert.equal(room.phase, 'waiting'); assert.equal(room.players.length, 2); assert.equal(room.winnerId, null);
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
    await connection.call('delete_room', { code, expectedVersion: outcome.room.version, confirmation: 'DELETE' },
      (await import('zod')).z.object({ deleted: (await import('zod')).z.literal(true) }));
    await assert.rejects(readFile(join(dir, `${code}.json`)), /ENOENT/);
  } finally { await connection.close(); await rm(dir, { recursive: true, force: true }); }
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
