import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectRace } from './connection.ts';
import { outcomeSchema } from './race.ts';
import { createCommentator, geminiProvider } from './agent.ts';
import type { Provider } from './agent.ts';

test('agent reads real MCP, receives no names/proofs, preserves signatures and cannot control the race', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'name-race-agent-'));
  const connection = await connectRace(dir);
  try {
    const { result } = await connection.call('create_room', {}, outcomeSchema);
    const code = result.room.code;
    await connection.call('join_room', { code, name: 'PrivateTestNickname', viewerKey: 'a'.repeat(64), consent: true }, outcomeSchema);
    let turn = 0;
    const provider: Provider = async input => {
      const text = JSON.stringify(input);
      assert.ok(!text.includes('PrivateTestNickname')); assert.ok(!text.includes('a'.repeat(64)));
      if (turn++ === 0) return [{ thoughtSignature: 'opaque-signature', functionCall: { name: 'read_race_summary', args: { code }, id: 'call-1' } }];
      assert.ok(text.includes('opaque-signature')); assert.ok(text.includes('call-1'));
      return [{ thought: true, text: 'hidden thought' }, { text: '{"phase":"waiting","style":"excited"}' }];
    };
    const reply = await createCommentator(connection, provider)(code);
    assert.match(reply.reply, /1 racer waiting/); assert.ok(!reply.reply.includes('hidden thought'));
    assert.equal(reply.trace[0]?.source, 'Agent -> MCP');
    await assert.rejects(createCommentator(connection, async () => [{
      functionCall: { name: 'host_control', args: { code, confirmation: 'START' } },
    }])(code), /unauthorized/);
    await assert.rejects(createCommentator(connection, async () => [{ text: '{"phase":"waiting","style":"calm"}' }])(code), /did not read/);
  } finally { await connection.close(); await rm(dir, { recursive: true, force: true }); }
});
test('native model key stays in a header and model HTTP failure is not a fake result', async () => {
  const provider = geminiProvider('test-api-key', 'test-model', async (input, init) => {
    assert.ok(!String(input).includes('test-api-key'));
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'test-api-key');
    return new Response('Denied', { status: 403 });
  });
  await assert.rejects(provider({ contents: [] }), /HTTP 403/);
});
