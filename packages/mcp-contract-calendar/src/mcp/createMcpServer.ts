import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import type { EntryType } from '@orpheussystems/shared-core';
import { runTool } from '../audit/audit';
import type { AuditSink, RequestMeta } from '../audit/audit';
import type { ToolContext } from '../domain/types';
import { ToolError } from '../tools/dateRange';
import { getMyContracts } from '../tools/getMyContracts';
import { listContracts } from '../tools/listContracts';
import { getCalendar } from '../tools/getCalendar';
import { getHolidays } from '../tools/getHolidays';
import { bookDays } from '../tools/bookDays';
import { removeDays } from '../tools/removeDays';

export const TOOL_NAMES = [
  'get_my_contracts',
  'list_contracts',
  'get_calendar',
  'book_days',
  'remove_days',
  'get_holidays'
] as const;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-MM-dd');
const ENTRY_TYPES: [EntryType, ...EntryType[]] = ['OnSiteFull', 'OnSiteHalf', 'OffSiteFull', 'OffSiteHalf'];
const entryType = z.enum(ENTRY_TYPES);
const contractId = z.number().int().positive();

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/**
 * Loosely typed view of McpServer.registerTool. The SDK generic signature infers handler args
 * from the zod shapes, which makes tsc blow up in memory with zod 3.25. Zod still validates at
 * runtime; each handler casts args to its own type.
 */
type ToolRegistrar = (
  name: string,
  config: { description: string; inputSchema: Record<string, ZodTypeAny> },
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
) => void;

const ok = (result: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(result) }] });

function fail(err: unknown): ToolResult {
  const body =
    err instanceof ToolError
      ? { code: err.code, message: err.message }
      : { code: 'internal', message: 'Internal error. Try again later.' };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] };
}

export function createMcpServer(ctx: ToolContext, meta: RequestMeta, sink: AuditSink): McpServer {
  const server = new McpServer({ name: 'contract-calendar', version: '0.1.0' });

  const register = server.registerTool.bind(server) as unknown as ToolRegistrar;

  const run = async <A, R>(
    name: string,
    args: A,
    fn: (c: ToolContext, a: A) => Promise<R>
  ): Promise<ToolResult> => {
    try {
      return ok(await runTool(name, ctx, meta, sink, args, fn));
    } catch (err) {
      return fail(err);
    }
  };

  register(
    'get_my_contracts',
    {
      description:
        'Lists the contracts you can see, with roles, today\'s date and used/remaining days. Start here to learn who you are and which contract ids to use. Closed contracts are excluded.',
      inputSchema: {}
    },
    async () => run('get_my_contracts', {}, c => getMyContracts(c))
  );

  register(
    'list_contracts',
    {
      description:
        'Lists contracts grouped by vendor (the company the contractor works through), with used and remaining days. For contract managers and HR only; contractors use get_my_contracts. Optionally filter by vendor name or manager name; if several managers match, returns needs_choice.',
      inputSchema: {
        vendor: z.string().optional().describe('Vendor (company) name, case-insensitive'),
        manager: z.string().optional().describe('Manager name or email'),
        includeClosed: z.boolean().optional()
      }
    },
    args => run('list_contracts', args as unknown as Parameters<typeof listContracts>[1], listContracts)
  );

  register(
    'get_calendar',
    {
      description:
        'Returns the calendar entries, holidays and totals of one contract for a date range (max 366 days). Dates are yyyy-MM-dd.',
      inputSchema: { contractId, from: dateStr, to: dateStr }
    },
    args => run('get_calendar', args as unknown as Parameters<typeof getCalendar>[1], getCalendar)
  );

  register(
    'book_days',
    {
      description:
        'Books calendar days for the signed-in contractor. Dates are yyyy-MM-dd. Weekends and holidays are skipped and reported. If a day falls in two overlapping contracts and contractId is missing, returns needs_choice; ask the user, never guess. Only contractors can book; managers and HR are read-only.',
      inputSchema: {
        from: dateStr,
        to: dateStr,
        type: entryType.optional().describe('Defaults to OnSiteFull'),
        contractId: contractId.optional(),
        note: z.string().max(255).optional()
      }
    },
    args => run('book_days', args as unknown as Parameters<typeof bookDays>[1], bookDays)
  );

  register(
    'remove_days',
    {
      description:
        'Removes the signed-in contractor\'s booked days from one of their own active contracts. Dates are yyyy-MM-dd. Days with no entry are reported as notFound. Only contractors can remove days.',
      inputSchema: { from: dateStr, to: dateStr, contractId }
    },
    args => run('remove_days', args as unknown as Parameters<typeof removeDays>[1], removeDays)
  );

  register(
    'get_holidays',
    {
      description: 'Returns public holidays for a country (2-letter code, e.g. BG) in a date range (max 366 days). Dates are yyyy-MM-dd.',
      inputSchema: { country: z.string().length(2), from: dateStr, to: dateStr }
    },
    args => run('get_holidays', args as unknown as Parameters<typeof getHolidays>[1], getHolidays)
  );

  return server;
}
