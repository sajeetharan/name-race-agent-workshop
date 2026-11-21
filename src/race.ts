import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { questions } from './questions.ts';

export class RaceError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) { super(message); this.code = code; this.status = status; }
}
export const codeSchema = z.string().regex(/^[A-F0-9]{8}$/);
export const keySchema = z.string().regex(/^[a-f0-9]{64}$/);
export const versionSchema = z.number().int().positive();
export const questionIndexSchema = z.number().int().min(0).max(4);
export const choiceSchema = z.number().int().min(0).max(3);
export const hostActionSchema = z.enum(['START', 'CLOSE', 'CLOSE_NEXT', 'NEXT', 'RESET', 'REMOVE']);
export const nicknameSchema = z.string().trim().transform(v => v.normalize('NFKC').replace(/ +/g, ' '))
  .refine(v => [...v].length >= 1 && [...v].length <= 24 && /^[\p{L}\p{M}\p{N} ._-]+$/u.test(v),
    'Use 1-24 letters, numbers, spaces, dots, hyphens or underscores.');
const savedPlayerSchema = z.object({
  id: z.uuid(), label: z.string(), name: z.string(), durationMs: z.number().nonnegative().nullable(),
  answers: z.array(z.object({
    questionIndex: questionIndexSchema, choice: choiceSchema,
    correct: z.boolean(), elapsedMs: z.number().nonnegative(),
  }).strict()).max(5).default([]),
}).strict();
const savedSchema = z.object({
  code: codeSchema, version: versionSchema, round: z.number().int().nonnegative(),
  phase: z.enum(['waiting', 'running', 'finished']), startedAt: z.number().nullable(),
  expiresAt: z.number(), winnerId: z.uuid().nullable(), nextLabel: z.number().int().positive(),
  mode: z.enum(['legacy', 'quiz']).default('legacy'),
  controlVersion: versionSchema.optional(),
  questionIndex: z.number().int().min(-1).max(4).default(-1),
  questionState: z.enum(['idle', 'open', 'closed']).default('idle'),
  questionOpenedAt: z.number().nullable().default(null),
  players: z.array(savedPlayerSchema.extend({ keyHash: keySchema })).max(120),
}).strict();
type SavedRoom = z.infer<typeof savedSchema>;
const playerSchema = savedPlayerSchema.omit({ answers: true }).extend({
  colorHue: z.number().int().min(0).max(359),
  score: z.number().int().min(0).max(500), correctAnswers: z.number().int().min(0).max(5),
  answerTimeMs: z.number().nonnegative(), rank: z.number().int().positive().nullable(),
  answered: z.boolean(),
}).strict();
export const roomSchema = z.object({
  code: codeSchema, version: versionSchema, round: z.number().int().nonnegative(),
  controlVersion: versionSchema, mode: z.enum(['legacy', 'quiz']),
  phase: z.enum(['waiting', 'running', 'finished']), startedAt: z.number().nullable(),
  expiresAt: z.number(), serverNow: z.number(), winnerId: z.uuid().nullable(),
  players: z.array(playerSchema).max(120), capacity: z.literal(120),
  question: z.object({
    index: questionIndexSchema, number: z.number().int().min(1).max(5), total: z.literal(5),
    prompt: z.string(), options: z.array(z.string()).length(4),
    openedAt: z.number(), closed: z.boolean(), answerCount: z.number().int().min(0).max(120),
    correctChoice: choiceSchema.nullable(), explanation: z.string().nullable(),
  }).strict().nullable(),
  previousQuestion: z.object({
    number: z.number().int().min(1).max(4), prompt: z.string(),
    options: z.array(z.string()).length(4), correctChoice: choiceSchema, explanation: z.string(),
  }).strict().nullable(),
}).strict();
export const outcomeSchema = z.object({
  room: roomSchema, you: z.uuid().nullable(),
  answer: z.object({ choice: choiceSchema, correct: z.boolean().nullable() }).strict().nullable(),
}).strict();
export type Room = z.infer<typeof roomSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
export const summarySchema = z.object({
  phase: z.enum(['waiting', 'running', 'finished']), round: z.number(), count: z.number(),
  winnerLabel: z.string().nullable(), leaders: z.array(z.string()).max(3),
  mode: z.enum(['legacy', 'quiz']), questionNumber: z.number().int().min(1).max(5).nullable(),
  questionClosed: z.boolean(),
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
  constructor(repository: Repository, now = Date.now) {
    this.repository = repository; this.now = now;
  }
  private require(room: SavedRoom | undefined) {
    if (!room || room.expiresAt <= this.now()) throw new RaceError('ROOM_GONE', 'This room is missing or expired. Ask the host for a new link.', 404);
    return room;
  }
  private view(room: SavedRoom, key?: string): Outcome {
    const finished = room.mode === 'legacy' && room.phase === 'running' && this.now() >= (room.startedAt ?? Infinity) + 8000;
    const players: z.infer<typeof playerSchema>[] = room.players.map(({ keyHash: _key, answers, ...player }) => {
      const correct = answers.filter(a => a.correct && (a.questionIndex < room.questionIndex || room.questionState === 'closed'));
      return { ...player, colorHue: ((Number(player.label.replace('Racer ', '')) - 1) * 137) % 360,
        score: correct.length * 100, correctAnswers: correct.length,
        answerTimeMs: correct.reduce((total, a) => total + a.elapsedMs, 0),
        rank: null, answered: answers.some(a => a.questionIndex === room.questionIndex) };
    });
    const ranked = [...players].sort((a, b) => b.score - a.score || a.answerTimeMs - b.answerTimeMs);
    ranked.forEach((player, index) => {
      const previous = ranked[index - 1];
      player.rank = previous && previous.score === player.score && previous.answerTimeMs === player.answerTimeMs
        ? previous.rank : index + 1;
    });
    const definition = questions[room.questionIndex];
    const previous = room.mode === 'quiz' ? questions[room.questionIndex - 1] : undefined;
    const own = key ? room.players.find(p => p.keyHash === hash(key)) : undefined;
    const answer = own?.answers.find(a => a.questionIndex === room.questionIndex);
    return { room: {
      code: room.code, version: room.version + Number(finished), round: room.round,
      controlVersion: (room.controlVersion ?? room.version) + Number(finished), mode: room.mode,
      phase: finished ? 'finished' : room.phase, startedAt: room.startedAt, expiresAt: room.expiresAt,
      serverNow: this.now(), winnerId: finished || room.phase === 'finished' ? room.winnerId : null, capacity: 120,
      players,
      question: room.mode === 'quiz' && definition && room.questionOpenedAt !== null ? {
        index: room.questionIndex, number: room.questionIndex + 1, total: 5, prompt: definition.prompt,
        options: [...definition.options], openedAt: room.questionOpenedAt,
        closed: room.questionState === 'closed', answerCount: players.filter(p => p.answered).length,
        correctChoice: room.questionState === 'closed' ? definition.correctChoice : null,
        explanation: room.questionState === 'closed' ? definition.explanation : null,
      } : null,
      previousQuestion: previous ? {
        number: room.questionIndex, prompt: previous.prompt, options: [...previous.options],
        correctChoice: previous.correctChoice, explanation: previous.explanation,
      } : null,
    }, you: own?.id ?? null,
    answer: answer ? { choice: answer.choice, correct: room.questionState === 'closed' ? answer.correct : null } : null };
  }
  async create() {
    const code = randomBytes(4).toString('hex').toUpperCase();
    return this.repository.mutate(code, existing => {
      if (existing) throw new RaceError('COLLISION', 'Room code collision. Create a new room.');
      const room: SavedRoom = { code, version: 1, round: 0, phase: 'waiting', startedAt: null,
        expiresAt: this.now() + 2 * 60 * 60 * 1000, winnerId: null, nextLabel: 1, players: [],
        mode: 'quiz', controlVersion: 1, questionIndex: -1, questionState: 'idle', questionOpenedAt: null };
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
      room.players.push({ id: randomUUID(), label: `Racer ${room.nextLabel++}`, name: nickname, keyHash, durationMs: null, answers: [] });
      room.controlVersion = (room.controlVersion ?? room.version) + 1;
      room.version++;
      return { room, value: this.view(room, key) };
    });
  }
  async answer(code: string, key: string, round: number, questionIndex: number, choice: number, receivedAt = this.now()) {
    const keyHash = hash(key), index = questionIndexSchema.parse(questionIndex), selected = choiceSchema.parse(choice);
    versionSchema.parse(round);
    return this.repository.mutate(codeSchema.parse(code), current => {
      const room = this.require(current);
      const player = room.players.find(p => p.keyHash === keyHash);
      if (!player) throw new RaceError('PLAYER', 'Join this room before answering.', 403);
      if (room.mode !== 'quiz' || room.round !== round) throw new RaceError('ROUND', 'The round changed. Read the question again.');
      const previous = player.answers.find(a => a.questionIndex === index);
      if (previous) {
        if (previous.choice !== selected) throw new RaceError('ANSWER_LOCKED', 'Your answer is already saved and cannot change.');
        return { room, value: this.view(room, key) };
      }
      if (room.phase !== 'running' || room.questionState !== 'open' || room.questionIndex !== index || room.questionOpenedAt === null) {
        throw new RaceError('QUESTION_CLOSED', 'This question is not open. Wait for the host.');
      }
      const question = questions[index]; if (!question) throw new Error('Missing quiz question.');
      if (!Number.isFinite(receivedAt) || receivedAt < room.questionOpenedAt || receivedAt > this.now()) {
        throw new RaceError('ANSWER_TIME', 'The answer is outside this question time. Read the current question again.');
      }
      player.answers.push({ questionIndex: index, choice: selected, correct: selected === question.correctChoice,
        elapsedMs: receivedAt - room.questionOpenedAt });
      room.version++;
      return { room, value: this.view(room, key) };
    });
  }
  async control(code: string, version: number, action: z.infer<typeof hostActionSchema>, playerId?: string) {
    return this.repository.mutate(codeSchema.parse(code), current => {
      const room = this.require(current), view = this.view(room);
      if (version !== view.room.controlVersion) throw new RaceError('STALE', 'The room changed. Read it and review again.');
      if (action === 'START') {
        if (view.room.phase !== 'waiting' || room.players.length < 1) throw new RaceError('START', 'Wait for at least one racer in an open room.');
        room.mode = 'quiz'; room.questionIndex = 0; room.questionState = 'open'; room.questionOpenedAt = this.now();
        room.players.forEach(p => { p.answers = []; p.durationMs = null; });
        room.winnerId = null; room.startedAt = this.now(); room.phase = 'running'; room.round++;
      } else if (action === 'CLOSE' || action === 'CLOSE_NEXT') {
        if (room.mode !== 'quiz' || room.phase !== 'running' || room.questionState !== 'open') throw new RaceError('CLOSE', 'Open a question before closing answers.');
        room.questionState = 'closed';
        if (room.questionIndex === questions.length - 1) {
          room.phase = 'finished';
          const top = [...this.view(room).room.players].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))[0];
          room.winnerId = top && top.score > 0 ? top.id : null;
        } else if (action === 'CLOSE_NEXT') {
          room.questionIndex++; room.questionState = 'open'; room.questionOpenedAt = this.now();
        }
      } else if (action === 'NEXT') {
        if (room.mode !== 'quiz' || room.phase !== 'running' || room.questionState !== 'closed' || room.questionIndex >= questions.length - 1) {
          throw new RaceError('NEXT', 'Close this question before opening the next one.');
        }
        room.questionIndex++; room.questionState = 'open'; room.questionOpenedAt = this.now();
      } else if (action === 'RESET') {
        if (view.room.phase !== 'finished') throw new RaceError('RESET', 'Finish this race before opening the next round.');
        room.mode = 'quiz'; room.phase = 'waiting'; room.startedAt = null; room.winnerId = null;
        room.questionIndex = -1; room.questionState = 'idle'; room.questionOpenedAt = null;
        room.players.forEach(p => { p.durationMs = null; p.answers = []; });
      } else {
        if (view.room.phase !== 'waiting') throw new RaceError('REMOVE', 'Remove nicknames only before the race.');
        const index = room.players.findIndex(p => p.id === playerId);
        if (index < 0) throw new RaceError('PLAYER', 'That racer is not in this room.');
        room.players.splice(index, 1);
      }
      room.version = view.room.version + 1;
      // Answer receipts change the read revision, not the host's question-control epoch.
      room.controlVersion = view.room.controlVersion + 1;
      return { room, value: this.view(room) };
    });
  }
  async summary(code: string): Promise<Summary> {
    const { room } = await this.read(code);
    return { phase: room.phase, round: room.round, count: room.players.length,
      mode: room.mode, questionNumber: room.question?.number ?? null, questionClosed: room.question?.closed ?? false,
      winnerLabel: room.players.find(p => p.id === room.winnerId)?.label ?? null,
      leaders: room.phase === 'waiting' ? [] : [...room.players]
        .sort((a, b) => room.mode === 'quiz' ? (a.rank ?? Infinity) - (b.rank ?? Infinity)
          : (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity)).slice(0, 3).map(p => p.label) };
  }
  async delete(code: string, version: number) {
    return this.repository.mutate(codeSchema.parse(code), current => {
      const state = this.view(this.require(current));
      if (state.room.controlVersion !== version) throw new RaceError('STALE', 'The room changed. Review deletion again.');
      return { room: null, value: { deleted: true as const } };
    });
  }
}
