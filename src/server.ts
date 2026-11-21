import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import { z } from 'zod';
import { connectRace } from './connection.ts';
import type { RaceConnection } from './connection.ts';
import { codeSchema, keySchema, nicknameSchema, outcomeSchema, RaceError, versionSchema } from './race.ts';
import { createCommentator, geminiProvider } from './agent.ts';
import type { Commentator } from './agent.ts';

export interface Config { publicOrigin?: string; password?: string }
const digest = (value: string) => createHash('sha256').update(value).digest();
function cookie(request: IncomingMessage, name: string) {
  return request.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
}
function session(password: string, expiry: string) { return createHmac('sha256', password).update(expiry).digest('hex'); }
export function createRaceServer(connection: RaceConnection, config: Config = {}, agent?: Commentator) {
  if (config.publicOrigin && (new URL(config.publicOrigin).origin !== config.publicOrigin ||
    !config.publicOrigin.startsWith('https://') || !config.password || config.password.length < 16)) {
    throw new Error('Public hosting requires an exact HTTPS PUBLIC_BASE_URL and a private HOST_PASSWORD of at least 16 characters.');
  }
  const server = createServer(async (request, response) => {
    const json = (status: number, data: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing listener.');
      const origin = config.publicOrigin ?? `http://127.0.0.1:${address.port}`;
      if (request.headers.host !== new URL(origin).host) throw new RaceError('HOST', 'Use the exact game URL.', 403);
      const path = new URL(request.url ?? '/', origin).pathname;
      const secure = config.publicOrigin ? '; Secure' : '';
      const setCookie = (name: string, value: string) => response.setHeader('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200${secure}`);
      const hostToken = cookie(request, 'nr_host')?.split('.');
      const authenticated = !config.password || Boolean(hostToken?.length === 2 && hostToken[0] && hostToken[1] &&
        /^\d+$/.test(hostToken[0]) && /^[a-f0-9]{64}$/.test(hostToken[1]) && Number(hostToken[0]) > Date.now() &&
        timingSafeEqual(Buffer.from(hostToken[1]), Buffer.from(session(config.password, hostToken[0]))));
      const hostOnly = () => { if (!authenticated) throw new RaceError('AUTH', 'Host login required.', 403); };
      if (request.method === 'GET') {
        if (path === '/healthz') { await connection.client.ping(); json(200, { ok: true }); return; }
        if (path === '/api/meta') { json(200, { authenticated, loginRequired: Boolean(config.password), ai: Boolean(agent) }); return; }
        const roomMatch = /^\/api\/room\/([A-F0-9]{8})$/.exec(path);
        if (roomMatch?.[1]) {
          const code = roomMatch[1], key = cookie(request, `nr_${code}`);
          if (key) keySchema.parse(key);
          const outcome = await connection.call('read_room', { code, ...(key ? { viewerKey: key } : {}) }, outcomeSchema);
          const etag = `"${code}-${outcome.result.room.version}-${outcome.result.you ?? 'guest'}"`;
          response.setHeader('ETag', etag);
          if (request.headers['if-none-match'] === etag) { response.writeHead(304); response.end(); return; }
          json(200, { result: outcome.result }); return;
        }
        const qr = /^\/api\/qr\/([A-F0-9]{8})$/.exec(path);
        if (qr?.[1]) {
          await connection.call('read_room', { code: qr[1] }, outcomeSchema);
          const image = await QRCode.toBuffer(`${origin}/r/${qr[1]}`, { width: 320, margin: 3, errorCorrectionLevel: 'M' });
          response.writeHead(200, { 'Content-Type': 'image/png' }); response.end(image); return;
        }
        const assets: Record<string, readonly [string, string]> = {
          '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'],
        };
        const asset = /^\/r\/[A-F0-9]{8}$/.test(path) ? assets['/'] : assets[path];
        if (asset) { response.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` }); response.end(readFileSync(new URL(`../public/${asset[0]}`, import.meta.url))); return; }
        json(404, { error: 'No such page.' }); return;
      }
      if (request.method !== 'POST') { json(405, { error: 'Use GET or POST.' }); return; }
      if (request.headers.origin !== origin) throw new RaceError('ORIGIN', 'Actions must come from the game page.', 403);
      if (request.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') throw new RaceError('CONTENT_TYPE', 'Use application/json.', 415);
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        size += value.length;
        if (size > 8192) { request.resume(); throw new RaceError('BODY_SIZE', 'Request exceeds 8 KB.', 413); }
        chunks.push(value);
      }
      let input: unknown;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch (error) { if (!(error instanceof SyntaxError)) throw error; throw new RaceError('JSON', 'Invalid JSON.', 400); }
      if (path === '/api/login') {
        const args = z.object({ password: z.string().max(256) }).strict().parse(input);
        if (!config.password || !timingSafeEqual(digest(args.password), digest(config.password))) throw new RaceError('AUTH', 'Incorrect host password.', 403);
        const expiry = String(Date.now() + 7200000); setCookie('nr_host', `${expiry}.${session(config.password, expiry)}`);
        json(200, { authenticated: true }); return;
      }
      if (path === '/api/join') {
        const args = z.object({ code: codeSchema, name: nicknameSchema, consent: z.literal(true) }).strict().parse(input);
        const key = cookie(request, `nr_${args.code}`) ?? randomBytes(32).toString('hex'); keySchema.parse(key);
        setCookie(`nr_${args.code}`, key);
        const outcome = await connection.call('join_room', { ...args, viewerKey: key }, outcomeSchema);
        json(200, outcome); return;
      }
      hostOnly();
      if (path === '/api/create') {
        z.object({}).strict().parse(input);
        const outcome = await connection.call('create_room', {}, outcomeSchema);
        json(200, { ...outcome, joinUrl: `${origin}/r/${outcome.result.room.code}` }); return;
      }
      if (path === '/api/control') {
        const args = z.object({ code: codeSchema, expectedVersion: versionSchema, confirmation: z.enum(['START', 'RESET', 'REMOVE']), playerId: z.uuid().optional() }).strict().parse(input);
        json(200, await connection.call('host_control', args, outcomeSchema)); return;
      }
      if (path === '/api/delete') {
        const args = z.object({ code: codeSchema, expectedVersion: versionSchema, confirmation: z.literal('DELETE') }).strict().parse(input);
        json(200, await connection.call('delete_room', args, z.object({ deleted: z.literal(true) }).strict())); return;
      }
      if (path === '/api/commentary') {
        const args = z.object({ code: codeSchema }).strict().parse(input);
        if (!agent) throw new RaceError('AI_OFF', 'AI commentary is off. The live game still uses real MCP.');
        json(200, await agent(args.code)); return;
      }
      json(404, { error: 'No such action.' });
    } catch (error) {
      const known = error instanceof RaceError, invalid = error instanceof z.ZodError;
      const code = known ? error.code : invalid ? 'ARGUMENTS' : 'SERVER';
      const message = known ? error.message : invalid ? 'Check the form input.' : 'The request failed. No result was assumed.';
      let detail = error instanceof Error ? error.message : String(error);
      for (const secret of [config.password, process.env.GEMINI_API_KEY]) if (secret) detail = detail.replaceAll(secret, '[redacted]');
      console.error(`[${code}] ${detail}`);
      json(known ? error.status : invalid ? 400 : 500, { error: message, code });
    }
  });
  server.requestTimeout = 30_000;
  return server;
}
if (import.meta.main) {
  const publicOrigin = process.env.PUBLIC_BASE_URL;
  const directory = resolve(process.env.RACE_DATA_DIR ?? '.race-data');
  await mkdir(directory, { recursive: true });
  const connection = await connectRace(directory);
  const key = process.env.GEMINI_API_KEY;
  try {
    const server = createRaceServer(connection, { ...(publicOrigin ? { publicOrigin } : {}),
      ...(process.env.HOST_PASSWORD ? { password: process.env.HOST_PASSWORD } : {}) },
    key ? createCommentator(connection, geminiProvider(key, process.env.GEMINI_MODEL)) : undefined);
    const port = z.coerce.number().int().min(1024).max(65535).parse(process.env.PORT ?? 18769);
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, publicOrigin ? '0.0.0.0' : '127.0.0.1', resolve); });
    console.log(`NAME RACE | ${publicOrigin ?? `http://127.0.0.1:${port}`} | real MCP | AI ${key ? 'on' : 'off'}`);
    async function stop() { server.close(); server.closeAllConnections(); await connection.close(); }
    process.once('SIGINT', () => { void stop(); }); process.once('SIGTERM', () => { void stop(); });
  } catch (error) { await connection.close(); throw error; }
}
