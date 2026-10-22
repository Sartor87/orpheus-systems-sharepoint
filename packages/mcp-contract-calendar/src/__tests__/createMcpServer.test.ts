import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, TOOL_NAMES } from '../mcp/createMcpServer';
import { MemoryAuditSink } from '../audit/audit';
import { localContext } from './localContext';

const meta = { correlationId: 'c1', oid: null, upn: null, tokenId: null };

async function connect(userId: number) {
  const sink = new MemoryAuditSink();
  const server = createMcpServer(await localContext(userId), meta, sink);
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
});
