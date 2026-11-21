import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { codeSchema, FileRepository, keySchema, nicknameSchema, RaceError, RaceStore, versionSchema } from './race.ts';

export function createRaceMcp(store: RaceStore, authority: string, guide = false) {
  const server = new McpServer({ name: guide ? 'name-race-guide' : 'name-race', version: '1.0.0' });
  const output = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
  function authorize(proof: string) {
    if (!keySchema.safeParse(proof).success || !keySchema.safeParse(authority).success ||
      !timingSafeEqual(Buffer.from(proof), Buffer.from(authority))) throw new RaceError('HOST', 'Host authorization required.', 403);
  }
  async function execute(action: () => Promise<unknown>) {
    try { return output(await action()); }
    catch (error) {
      if (!(error instanceof RaceError) && !(error instanceof z.ZodError)) throw error;
      return { ...output({ code: error instanceof RaceError ? error.code : 'ARGUMENTS',
        message: error instanceof RaceError ? error.message : 'Check the tool input.', status: error instanceof RaceError ? error.status : 400 }), isError: true };
    }
  }
  if (guide) {
    server.registerTool('get_game_rules', { inputSchema: {}, annotations: { readOnlyHint: true } }, () => output({
      rules: '120 nicknames per room. Phone joining. Host reviews START. Code uniformly shuffles racers. Eight-second race. Host alone reopens or deletes a room.',
      privacy: 'No email or real name needed. Only anonymous racer labels reach an optional AI commentator.',
    }));
    server.registerTool('get_build_steps', { inputSchema: {}, annotations: { readOnlyHint: true } }, () => output({
      steps: ['Brief and reviewed plan', 'Test room rules', 'Build phone and host screens', 'Use the Skill',
        'Discover real MCP tools', 'Add bounded read-only commentary', 'Verify two browsers', 'Deploy with private host password'],
    }));
    return server;
  }
  server.registerTool('read_room', { inputSchema: { code: codeSchema, viewerKey: keySchema.optional() },
    annotations: { readOnlyHint: true } }, args => execute(() => store.read(args.code, args.viewerKey)));
  server.registerTool('read_race_summary', { description: 'Read actual race facts using anonymous labels only. No participant names or credentials.',
    inputSchema: { code: codeSchema }, annotations: { readOnlyHint: true } }, args => execute(() => store.summary(args.code)));
  server.registerTool('create_room', { inputSchema: { authority: keySchema } }, args => execute(async () => {
    authorize(args.authority); return store.create();
  }));
  server.registerTool('join_room', { inputSchema: { code: codeSchema, name: nicknameSchema, viewerKey: keySchema, consent: z.literal(true) } },
    args => execute(() => store.join(args.code, args.name, args.viewerKey, args.consent)));
  server.registerTool('host_control', { inputSchema: { code: codeSchema, expectedVersion: versionSchema,
    confirmation: z.enum(['START', 'RESET', 'REMOVE']), playerId: z.uuid().optional(), authority: keySchema } }, args => execute(async () => {
    authorize(args.authority); return store.control(args.code, args.expectedVersion, args.confirmation, args.playerId);
  }));
  server.registerTool('delete_room', { inputSchema: { code: codeSchema, expectedVersion: versionSchema, confirmation: z.literal('DELETE'), authority: keySchema } },
    args => execute(async () => { authorize(args.authority); return store.delete(args.code, args.expectedVersion); }));
  return server;
}
if (import.meta.main) {
  const guide = process.argv.includes('--guide');
  if (process.argv.slice(2).some(v => v !== '--guide')) throw new Error('Use --guide or no arguments.');
  if (!guide && (!process.env.RACE_DATA_DIR || !process.env.RACE_AUTHORITY)) throw new Error('The runtime broker must be started by the HTTP host.');
  const repository = new FileRepository(process.env.RACE_DATA_DIR ?? '.race-data');
  if (!guide) {
    await repository.cleanExpired();
    setInterval(() => { void repository.cleanExpired().catch(error => console.error('[ROOM_CLEANUP]', error)); }, 60000).unref();
  }
  await createRaceMcp(new RaceStore(repository),
    process.env.RACE_AUTHORITY ?? '', guide).connect(new StdioServerTransport());
}
