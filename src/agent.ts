import { z } from 'zod';
import type { RaceConnection, Trace } from './connection.ts';
import { RaceError, summarySchema } from './race.ts';
const partSchema = z.object({
  text: z.string().optional(), thought: z.boolean().optional(), thoughtSignature: z.string().optional(),
  functionCall: z.object({ name: z.string(), args: z.record(z.string(), z.unknown()).optional(), id: z.string().optional() }).passthrough().optional(),
}).passthrough();
export type Part = z.infer<typeof partSchema>;
export type Provider = (request: Record<string, unknown>) => Promise<Part[]>;
export function geminiProvider(key: string, model = 'gemini-flash-latest', fetcher: typeof fetch = fetch): Provider {
  if (!key.trim() || !/^[a-zA-Z0-9._-]+$/.test(model)) throw new RaceError('MODEL_CONFIG', 'Check the private Gemini key and plain model name.');
  return async request => {
    const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(request), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new RaceError('MODEL_HTTP', `Gemini returned HTTP ${response.status}. No model result was assumed.`, 502);
    const value: unknown = await response.json();
    const parsed = z.object({ candidates: z.array(z.object({ content: z.object({ parts: z.array(partSchema).min(1) }) })).min(1) }).parse(value);
    const first = parsed.candidates[0]; if (!first) throw new RaceError('MODEL_EMPTY', 'No model reply.', 502);
    return first.content.parts;
  };
}
export function createCommentator(connection: RaceConnection, provider: Provider) {
  return async (code: string) => {
    const tool = connection.tools.find(t => t.name === 'read_race_summary');
    if (!tool) throw new RaceError('MCP_TOOL', 'The commentary tool is missing.', 502);
    const { $schema: _schema, ...parametersJsonSchema } = tool.inputSchema;
    const contents: { role: string; parts: unknown[] }[] = [{ role: 'user', parts: [{ text: `Read race ${code}. Then reply with JSON {"phase":"waiting|running|finished","style":"calm|excited"}.` }] }];
    const trace: Trace[] = [];
    let summary: z.infer<typeof summarySchema> | undefined;
    for (let turn = 0; turn < 3; turn++) {
      const parts = await provider({
        systemInstruction: { parts: [{ text: 'Use only read_race_summary, once, with the supplied room code. The tool contains anonymous labels, never names. Do not start, reset or pick a winner. After reading, choose a commentary style and return only the requested JSON with the actual phase. Code renders all factual words from the tool result.' }] },
        contents, tools: [{ functionDeclarations: [{ name: tool.name, description: tool.description, parametersJsonSchema }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 200 },
      });
      const calls = parts.filter(p => p.functionCall);
      if (!calls.length) {
        if (!summary) throw new RaceError('MODEL_ACTION', 'The agent did not read the real race.');
        const text = parts.filter(p => !p.thought && p.text).map(p => p.text).join('');
        const choice = z.object({ phase: z.enum(['waiting', 'running', 'finished']), style: z.enum(['calm', 'excited']) }).strict().parse(JSON.parse(text));
        if (choice.phase !== summary.phase) throw new RaceError('MODEL_FACT', 'The model described a different race phase.');
        const latest = (await connection.call('read_race_summary', { code }, summarySchema)).result;
        if (JSON.stringify(latest) !== JSON.stringify(summary)) throw new RaceError('STALE_COMMENTARY', 'The race changed while the model replied. Ask again.');
        const fact = summary.phase === 'waiting' ? `${summary.count} racer${summary.count === 1 ? '' : 's'} waiting. The host starts the race.`
          : summary.phase === 'running' ? `${summary.count} racers are on the track.${summary.mode === 'quiz' ? ` Question ${summary.questionNumber} is ${summary.questionClosed ? 'closed' : 'open'}. Correct answers move the cars.` : ' Watch the finish line.'}`
            : summary.winnerLabel ? `${summary.winnerLabel} leads round ${summary.round}. ${summary.mode === 'quiz' ? 'Correct answers and answer time decide the ranks, not AI.' : 'Code picked the finish order, not AI.'}`
              : `Round ${summary.round} is finished. No correct answers were recorded.`;
        return { reply: (choice.style === 'excited' ? 'Here we go! ' : '') + fact, trace };
      }
      if (summary || calls.length !== 1) throw new RaceError('TOOL_LIMIT', 'Only one read is allowed per commentary.');
      const call = calls[0]?.functionCall;
      if (!call || call.name !== 'read_race_summary' || call.args?.code !== code ||
        Object.keys(call.args).some(key => key !== 'code')) throw new RaceError('TOOL_DENIED', 'The agent requested an unauthorized tool or room.');
      const result = await connection.call(call.name, call.args, summarySchema, 'Agent -> MCP');
      summary = result.result; trace.push(...result.trace);
      contents.push({ role: 'model', parts });
      contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: summary } }] });
    }
    throw new RaceError('TURN_LIMIT', 'The commentator reached its limit.');
  };
}
export type Commentator = ReturnType<typeof createCommentator>;
