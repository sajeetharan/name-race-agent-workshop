import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { once } from 'node:events';
import { connectRace } from './connection.ts';
import { createRaceServer } from './server.ts';
import { questions } from './questions.ts';

test('separate guest/host flows enforce login, consent, origin, source isolation and real QR', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'name-race-http-'));
  const connection = await connectRace(dir);
  const server = createRaceServer(connection, { password: 'test-host-password-long' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No listener');
  const origin = `http://127.0.0.1:${address.port}`;
  const post = (path: string, data: unknown, cookies = '', source = origin) => fetch(`${origin}${path}`, {
    method: 'POST', headers: { Origin: source, 'Content-Type': 'application/json', Cookie: cookies }, body: JSON.stringify(data),
  });
  try {
    assert.equal((await post('/api/create', {})).status, 403);
    assert.equal((await post('/api/login', { password: 'wrong' })).status, 403);
    const login = await post('/api/login', { password: 'test-host-password-long' });
    const hostCookie = login.headers.get('set-cookie')?.split(';')[0]; assert.ok(hostCookie);
    const create = await post('/api/create', {}, hostCookie); assert.equal(create.status, 200);
    const value = await create.json(), code = value.result.room.code;
    assert.equal(value.joinUrl, `${origin}/r/${code}`);
    assert.equal((await post('/api/join', { code, name: 'Green Bird', consent: false })).status, 400);
    const join = await post('/api/join', { code, name: 'Green Bird', consent: true });
    const viewerCookie = join.headers.get('set-cookie')?.split(';')[0]; assert.ok(viewerCookie);
    const first = await join.json(); assert.ok(first.result.you);
    const orange = await post('/api/join', { code, name: 'Orange Cat', consent: true });
    const orangeCookie = orange.headers.get('set-cookie')?.split(';')[0]; assert.ok(orangeCookie);
    const stateResponse = await fetch(`${origin}/api/room/${code}`, { headers: { Cookie: viewerCookie } });
    const state = await stateResponse.json(); assert.equal(state.result.you, first.result.you);
    assert.equal((await fetch(`${origin}/api/room/${code}`, { headers: { Cookie: viewerCookie, 'If-None-Match': stateResponse.headers.get('etag') ?? '' } })).status, 304);
    const control = { code, expectedVersion: state.result.room.version, confirmation: 'START' };
    assert.equal((await post('/api/control', control, viewerCookie)).status, 403);
    assert.equal((await post('/api/control', control, hostCookie, 'https://evil.example')).status, 403);
    const qr = await fetch(`${origin}/api/qr/${code}`); assert.equal(qr.status, 200); assert.equal(qr.headers.get('content-type'), 'image/png');
    assert.ok((await qr.arrayBuffer()).byteLength > 500);
    assert.equal((await fetch(`${origin}/src/race.ts`)).status, 404);
    assert.equal((await fetch(`${origin}/.race-data/${code}.json`)).status, 404);
    const wrongHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${origin}/healthz`, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(wrongHost, 403);
    const boundary = (size: number) => fetch(`${origin}/api/create`, { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: hostCookie }, body: '{}' + ' '.repeat(size - 2) });
    assert.equal((await boundary(8192)).status, 200); assert.equal((await boundary(8193)).status, 413);
    const started = await post('/api/control', control, hostCookie); assert.equal(started.status, 200);
    const running = await started.json();
    const answer = { code, round: running.result.room.round, questionIndex: 0, choice: 1 };
    assert.equal((await post('/api/answer', answer)).status, 403);
    assert.equal((await post('/api/answer', { ...answer, receivedAt: 0 }, viewerCookie)).status, 400);
    assert.equal((await post('/api/answer', { ...answer, choice: 4 }, viewerCookie)).status, 400);
    const submitted = await post('/api/answer', answer, viewerCookie); assert.equal(submitted.status, 200);
    const privateResult = await submitted.json();
    assert.equal(privateResult.result.answer.correct, null); assert.equal(privateResult.result.room.question.correctChoice, null);
    assert.equal(privateResult.result.room.players[0].score, 0);
    const closed = await post('/api/control', { code, expectedVersion: running.result.room.controlVersion, confirmation: 'CLOSE' }, hostCookie);
    assert.equal(closed.status, 200);
    const revealed = await closed.json(); assert.equal(revealed.result.room.players[0].score, 100);
    assert.equal((await post('/api/answer', answer, orangeCookie)).status, 409);
    const personal = await (await fetch(`${origin}/api/room/${code}`, { headers: { Cookie: viewerCookie } })).json();
    assert.equal(personal.result.answer.correct, true);
    const publicState = await (await fetch(`${origin}/api/room/${code}`)).json(); assert.equal(publicState.result.answer, null);
    const next = await post('/api/control', { code, expectedVersion: revealed.result.room.controlVersion, confirmation: 'NEXT' }, hostCookie);
    assert.equal(next.status, 200);
    let advanced = await next.json();
    const closeNext = { code, expectedVersion: advanced.result.room.controlVersion, confirmation: 'CLOSE_NEXT' };
    assert.equal((await post('/api/control', closeNext, viewerCookie)).status, 403);
    const moved = await post('/api/control', closeNext, hostCookie);
    assert.equal(moved.status, 200);
    advanced = await moved.json();
    assert.equal(advanced.result.room.question.number, 3);
    assert.equal(advanced.result.room.question.correctChoice, null);
    assert.equal(advanced.result.room.previousQuestion.number, 2);
    assert.equal((await post('/api/control', closeNext, hostCookie)).status, 409);
    for (let index = 2; index < questions.length; index++) {
      assert.equal((await post('/api/answer', { code, round: advanced.result.room.round, questionIndex: index,
        choice: questions[index]!.correctChoice }, viewerCookie)).status, 200);
      const response = await post('/api/control', { code, expectedVersion: advanced.result.room.controlVersion, confirmation: 'CLOSE_NEXT' }, hostCookie);
      assert.equal(response.status, 200);
      advanced = await response.json();
    }
    assert.equal(advanced.result.room.phase, 'finished');
    assert.equal(advanced.result.room.players[0].score, 400);
    assert.equal(advanced.result.room.winnerId, first.result.you);
    assert.equal((await post('/api/join', { code, name: 'Late Racer', consent: true })).status, 409);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await connection.close(); await rm(dir, { recursive: true, force: true }); }
});
test('public server rejects missing host secret and non-HTTPS configuration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'name-race-config-'));
  const connection = await connectRace(dir);
  try {
    assert.throws(() => createRaceServer(connection, { publicOrigin: 'https://game.example' }), /private HOST_PASSWORD/);
    assert.throws(() => createRaceServer(connection, { publicOrigin: 'http://game.example', password: 'test-password-long' }), /HTTPS/);
  } finally { await connection.close(); await rm(dir, { recursive: true, force: true }); }
});
