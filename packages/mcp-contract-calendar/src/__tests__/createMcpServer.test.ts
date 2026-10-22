import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, TOOL_NAMES } from '../mcp/createMcpServer';
import { MemoryAuditSink } from '../audit/audit';
import { localContext } from './localContext';
import type { ToolContext } from '../domain/types';

const meta = { correlationId: 'c1', oid: null, upn: null, tokenId: null };

async function connect(userId: number, patch?: (c: ToolContext) => ToolContext) {
  const sink = new MemoryAuditSink();
  const base = await localContext(userId);
  const server = createMcpServer(patch ? patch(base) : base, meta, sink);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '0' });
  await Promise.all([server.connect(st), client.connect(ct)]);
  return { client, sink };
}

const textOf = (r: unknown): string => (r as { content: Array<{ text: string }> }).content[0].text;

describe('createMcpServer', () => {
  it('lists the six tools', async () => {
    const { client } = await connect(1);
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    expect(TOOL_NAMES).toHaveLength(6);
  });

  it('maps ToolError to isError with code', async () => {
    const { client, sink } = await connect(3); // Maria: manager, cannot book
    const r = await client.callTool({ name: 'book_days', arguments: { from: '2026-11-02', to: '2026-11-03' } });
    expect(r.isError).toBe(true);
    expect(JSON.parse(textOf(r)).code).toBe('forbidden');
    expect(sink.events[0].outcome).toBe('error');
  });

  it('rejects malformed input', async () => {
    const { client } = await connect(1);
    const r = await client.callTool({ name: 'book_days', arguments: { from: 'tomorrow', to: '2026-11-03' } }).catch(e => e);
    expect(r instanceof Error || (r as { isError?: boolean }).isError).toBeTruthy();
  });

  it('get_my_contracts as Jane returns her 2 non-closed contracts', async () => {
    const { client } = await connect(1);
    const r = await client.callTool({ name: 'get_my_contracts', arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(textOf(r)).contracts).toHaveLength(2);
  });

  it('declares tool annotations so Copilot can decide confirmations', async () => {
    const { client } = await connect(1);
    const { tools } = await client.listTools();
    const ann = Object.fromEntries(tools.map(t => [t.name, t.annotations]));
    for (const n of ['get_my_contracts', 'list_contracts', 'get_calendar', 'get_holidays']) {
      expect(ann[n]).toMatchObject({ readOnlyHint: true });
    }
    expect(ann.book_days).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(ann.remove_days).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it('logs a non-ToolError failure to stderr without token, returns a generic error', async () => {
    const lines: string[] = [];
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(((s: string) => {
      lines.push(String(s));
      return true;
    }) as never);
    let r: unknown;
    try {
      const { client } = await connect(1, c => ({
        ...c,
        directory: {
          ...c.directory,
          listVisible: () => Promise.reject(new TypeError('backend said Bearer eyJhbGciOi.payload.sig'))
        }
      }));
      r = await client.callTool({ name: 'get_my_contracts', arguments: {} });
    } finally {
      spy.mockRestore();
    }
    expect((r as { isError?: boolean }).isError).toBe(true);
    expect(JSON.parse(textOf(r))).toEqual({ code: 'internal', message: 'Internal error. Try again later.' });
    const line = lines.find(l => l.includes('"event":"error"'));
    expect(line).toBeDefined();
    const ev = JSON.parse(line as string);
    expect(ev).toMatchObject({ event: 'error', correlationId: 'c1', where: 'tool:get_my_contracts', name: 'TypeError' });
    expect(line).not.toMatch(/Bearer|eyJ/);
  });
});
