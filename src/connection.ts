import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { RaceError } from './race.ts';

export interface Trace { source: 'Human -> MCP' | 'Agent -> MCP'; kind: 'call' | 'result'; tool: string; data: unknown }
export async function connectRace(directory: string, guide = false) {
  const authority = randomBytes(32).toString('hex');
  const client = new Client({ name: 'name-race-host', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './mcp.ts' : './mcp.js', import.meta.url)), ...(guide ? ['--guide'] : [])],
    env: { RACE_DATA_DIR: directory, RACE_AUTHORITY: authority }, stderr: 'inherit',
  });
  try { await client.connect(transport); }
  catch (error) { await transport.close(); throw error; }
  let tools;
  try { tools = (await client.listTools()).tools; } catch (error) { await client.close(); throw error; }
  let pending: Promise<void> = Promise.resolve();
  async function call<T extends z.ZodType>(name: string, args: Record<string, unknown>, schema: T, source: Trace['source'] = 'Human -> MCP') {
    const actual = ['create_room', 'host_control', 'delete_room', 'submit_answer'].includes(name) ? { ...args, authority } : args;
    const visible = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'viewerKey' && key !== 'authority'));
    const trace: Trace[] = [{ source, kind: 'call', tool: name, data: visible }];
    // Ordered writes avoid concurrent stdio backpressure listeners during audience joins.
    const operation = pending.then(() => client.callTool({ name, arguments: actual }, undefined, { timeout: 20_000 }));
    pending = operation.then(() => undefined, () => undefined);
    const result = await operation;
    if (!Array.isArray(result.content) || result.content.length !== 1 || result.content[0]?.type !== 'text' ||
      typeof result.content[0].text !== 'string') throw new RaceError('MCP_RESULT', 'Unsupported MCP result.', 502);
    const value: unknown = JSON.parse(result.content[0].text);
    if (result.isError) {
      const error = z.object({ code: z.string(), message: z.string(), status: z.number() }).parse(value);
      throw new RaceError(error.code, error.message, error.status);
    }
    const parsed = schema.parse(value);
    trace.push({ source, kind: 'result', tool: name, data: parsed });
    return { result: parsed, trace };
  }
  return { client, tools, call, close: () => client.close() };
}
export type RaceConnection = Awaited<ReturnType<typeof connectRace>>;
