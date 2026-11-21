import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';

export class RaceError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) { super(message); this.code = code; this.status = status; }
}
export const codeSchema = z.string().regex(/^[A-F0-9]{8}$/);
export const keySchema = z.string().regex(/^[a-f0-9]{64}$/);
export const versionSchema = z.number().int().positive();
export const nicknameSchema = z.string().trim().transform(v => v.normalize('NFKC').replace(/ +/g, ' '))
  .refine(v => [...v].length >= 1 && [...v].length <= 24 && /^[\p{L}\p{M}\p{N} ._-]+$/u.test(v),
    'Use 1-24 letters, numbers, spaces, dots, hyphens or underscores.');
const playerSchema = z.object({
  id: z.uuid(), label: z.string(), name: z.string(), durationMs: z.number().nonnegative().nullable(),
}).strict();
const savedSchema = z.object({
  code: codeSchema, version: versionSchema, round: z.number().int().nonnegative(),
  phase: z.enum(['waiting', 'running']), startedAt: z.number().nullable(),
  expiresAt: z.number(), winnerId: z.uuid().nullable(), nextLabel: z.number().int().positive(),
  players: z.array(playerSchema.extend({ keyHash: keySchema })).max(120),
}).strict();
type SavedRoom = z.infer<typeof savedSchema>;
export const roomSchema = z.object({
  code: codeSchema, version: versionSchema, round: z.number().int().nonnegative(),
  phase: z.enum(['waiting', 'running', 'finished']), startedAt: z.number().nullable(),
  expiresAt: z.number(), serverNow: z.number(), winnerId: z.uuid().nullable(),
  players: z.array(playerSchema).max(120), capacity: z.literal(120),
}).strict();
export const outcomeSchema = z.object({ room: roomSchema, you: z.uuid().nullable() }).strict();
export type Room = z.infer<typeof roomSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
export const summarySchema = z.object({
  phase: z.enum(['waiting', 'running', 'finished']), round: z.number(), count: z.number(),
  winnerLabel: z.string().nullable(), leaders: z.array(z.string()).max(3),
}).strict();
export type Summary = z.infer<typeof summarySchema>;
type Mutation<T> = { room: SavedRoom | null; value: T };
export interface Repository {
  read(code: string): Promise<SavedRoom | undefined>;
  mutate<T>(code: string, action: (room: SavedRoom | undefined) => Mutation<T>): Promise<T>;
}
export class MemoryRepository implements Repository {
  readonly rooms = new Map<string, SavedRoom>();
  async read(code: string) { const room = this.rooms.get(code); return room ? structuredClone(room) : undefined; }
  async mutate<T>(code: string, action: (room: SavedRoom | undefined) => Mutation<T>) {
    const existing = this.rooms.get(code);
    const change = action(existing ? structuredClone(existing) : undefined);
    if (change.room) this.rooms.set(code, structuredClone(change.room)); else this.rooms.delete(code);
    return change.value;
  }
}
export class FileRepository implements Repository {
  readonly directory: string;
  private readonly queues = new Map<string, Promise<unknown>>();
  constructor(directory: string) { this.directory = resolve(directory); }
  private path(code: string) { return join(this.directory, `${codeSchema.parse(code)}.json`); }
  async read(code: string) {
    let contents: string;
    try { contents = await readFile(this.path(code), 'utf8'); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined; throw error; }
    try { return savedSchema.parse(JSON.parse(contents)); }
    catch (error) {
      console.error('[CORRUPT_ROOM]', error instanceof Error ? error.message : String(error));
      throw new RaceError('CORRUPT_ROOM', 'Room data is damaged. It was not silently reset.', 500);
    }
  }
  async mutate<T>(code: string, action: (room: SavedRoom | undefined) => Mutation<T>) {
    const prior = this.queues.get(code) ?? Promise.resolve();
    // The prior caller receives its error; a failure must not poison later operations.
    const operation = prior.catch(() => undefined).then(async () => {
      const change = action(await this.read(code));
      if (!change.room) { await rm(this.path(code), { force: true }); return change.value; }
      await mkdir(this.directory, { recursive: true });
      const temp = join(this.directory, `${code}.${randomUUID()}.tmp`);
      try {
        await writeFile(temp, JSON.stringify(change.room), { flag: 'wx', mode: 0o600 });
        await rename(temp, this.path(code));
      } finally { await rm(temp, { force: true }); }
      return change.value;
    });
    this.queues.set(code, operation);
    try { return await operation; } finally { if (this.queues.get(code) === operation) this.queues.delete(code); }
  }
  async cleanExpired(now = Date.now()) {
    let names: string[];
    try { names = await readdir(this.directory); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return; throw error; }
    for (const name of names.filter(v => /^[A-F0-9]{8}\.json$/.test(v))) {
      const code = name.slice(0, 8), room = await this.read(code);
      if (room && room.expiresAt <= now) await this.mutate(code, current => ({
        room: current && current.expiresAt > now ? current : null, value: undefined,
      }));
    }
  }
}
const hash = (key: string) => createHash('sha256').update(keySchema.parse(key)).digest('hex');
export class RaceStore {
  readonly repository: Repository;
  readonly now: () => number;
  readonly choose: (max: number) => number;
  constructor(repository: Repository, now = Date.now, choose: (max: number) => number = randomInt) {
    this.repository = repository; this.now = now; this.choose = choose;
  }
  private require(room: SavedRoom | undefined) {
    if (!room || room.expiresAt <= this.now()) throw new RaceError('ROOM_GONE', 'This room is missing or expired. Ask the host for a new link.', 404);
    return room;
  }
  private view(room: SavedRoom, key?: string): Outcome {
    const finished = room.phase === 'running' && this.now() >= (room.startedAt ?? Infinity) + 8000;
    return { room: {
      code: room.code, version: room.version + Number(finished), round: room.round,
      phase: finished ? 'finished' : room.phase, startedAt: room.startedAt, expiresAt: room.expiresAt,
      serverNow: this.now(), winnerId: finished ? room.winnerId : null, capacity: 120,
      players: room.players.map(({ keyHash: _key, ...player }) => player),
    }, you: key ? room.players.find(p => p.keyHash === hash(key))?.id ?? null : null };
  }
  async create() {
    const code = randomBytes(4).toString('hex').toUpperCase();
    return this.repository.mutate(code, existing => {
      if (existing) throw new RaceError('COLLISION', 'Room code collision. Create a new room.');
      const room: SavedRoom = { code, version: 1, round: 0, phase: 'waiting', startedAt: null,
        expiresAt: this.now() + 2 * 60 * 60 * 1000, winnerId: null, nextLabel: 1, players: [] };
      return { room, value: this.view(room) };
    });
  }
  async read(code: string, key?: string) { return this.view(this.require(await this.repository.read(codeSchema.parse(code))), key); }
  async join(code: string, name: string, key: string, consent: true) {
    const nickname = nicknameSchema.parse(name), keyHash = hash(key);
    if (consent !== true) throw new RaceError('CONSENT', 'Please agree to show your nickname.');
    return this.repository.mutate(codeSchema.parse(code), current => {
      const room = this.require(current);
      const own = room.players.find(p => p.keyHash === keyHash);
      if (own) {
        if (own.name !== nickname) throw new RaceError('NAME_LOCKED', 'This browser already joined with a different nickname.');
        return { room, value: this.view(room, key) };
      }
      if (room.phase !== 'waiting') throw new RaceError('JOIN_CLOSED', 'Joining is closed. Wait for the host to open the next round.');
      if (room.players.length >= 120) throw new RaceError('ROOM_FULL', 'This room already has 120 racers.');
      if (room.players.some(p => p.name.toLowerCase() === nickname.toLowerCase())) throw new RaceError('DUPLICATE_NAME', 'That nickname is taken. Choose another.');
      room.players.push({ id: randomUUID(), label: `Racer ${room.nextLabel++}`, name: nickname, keyHash, durationMs: null });
      room.version++;
      return { room, value: this.view(room, key) };
    });
  }
  async control(code: string, version: number, action: 'START' | 'RESET' | 'REMOVE', playerId?: string) {
    return this.repository.mutate(codeSchema.parse(code), current => {
      const room = this.require(current), view = this.view(room);
      if (version !== view.room.version) throw new RaceError('STALE', 'The room changed. Read it and review again.');
      if (action === 'START') {
        if (view.room.phase !== 'waiting' || room.players.length < 2) throw new RaceError('START', 'Wait for at least two racers in an open room.');
        const order = [...room.players];
        for (let i = order.length - 1; i > 0; i--) {
          const j = this.choose(i + 1);
          if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid random index.');
          [order[i], order[j]] = [order[j]!, order[i]!];
        }
        const winner = order[0]; if (!winner) throw new Error('Missing winner.');
        order.forEach((p, i) => { p.durationMs = 8000 + i * 4000 / (order.length - 1); });
        room.winnerId = winner.id; room.startedAt = this.now() + 2500; room.phase = 'running'; room.round++;
      } else if (action === 'RESET') {
        if (view.room.phase !== 'finished') throw new RaceError('RESET', 'Finish this race before opening the next round.');
        room.phase = 'waiting'; room.startedAt = null; room.winnerId = null;
        room.players.forEach(p => { p.durationMs = null; });
      } else {
        if (view.room.phase !== 'waiting') throw new RaceError('REMOVE', 'Remove nicknames only before the race.');
        const index = room.players.findIndex(p => p.id === playerId);
        if (index < 0) throw new RaceError('PLAYER', 'That racer is not in this room.');
        room.players.splice(index, 1);
      }
      room.version = view.room.version + 1;
      return { room, value: this.view(room) };
    });
  }
  async summary(code: string): Promise<Summary> {
    const { room } = await this.read(code);
    return { phase: room.phase, round: room.round, count: room.players.length,
      winnerLabel: room.players.find(p => p.id === room.winnerId)?.label ?? null,
      leaders: room.phase === 'waiting' ? [] : [...room.players]
        .sort((a, b) => (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity)).slice(0, 3).map(p => p.label) };
  }
  async delete(code: string, version: number) {
    return this.repository.mutate(codeSchema.parse(code), current => {
      const state = this.view(this.require(current));
      if (state.room.version !== version) throw new RaceError('STALE', 'The room changed. Review deletion again.');
      return { room: null, value: { deleted: true as const } };
    });
  }
}
