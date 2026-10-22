import { computeRemaining, computeTotals } from '@orpheussystems/shared-core';
import type { CalendarEntry, Holiday, Remaining, Totals } from '@orpheussystems/shared-core';
import type { ToolContext, VendorContract } from '../domain/types';
import { ToolError, parseRange } from './dateRange';
import { toSummary } from './getMyContracts';
import type { ContractSummary } from './getMyContracts';

export async function findVisibleContract(
  ctx: ToolContext,
  contractId: number,
  opts: { includeClosed?: boolean } = {}
): Promise<VendorContract> {
  const list = await ctx.directory.listVisible(ctx.viewer, { includeClosed: true });
  const c = list.find(x => x.id === contractId);
  if (!c || (c.status === 'Closed' && !opts.includeClosed)) {
    throw new ToolError('not_found', `Contract ${contractId} not found.`);
  }
  return c;
}

export async function getCalendar(
  ctx: ToolContext,
  args: { contractId: number; from: string; to: string }
): Promise<{
  contract: ContractSummary;
  entries: CalendarEntry[];
  holidays: Holiday[];
  periodTotals: Totals;
  contractTotals: Totals;
  remaining: Remaining;
}> {
  const days = parseRange(args.from, args.to, 366);
  const c = await findVisibleContract(ctx, args.contractId, { includeClosed: true });
  const from = days[0];
  const to = days[days.length - 1];
  const entries = await ctx.data.getEntries(c.id, from, to);
  const holidays = await ctx.data.getHolidays(c.country, from, to);
  const all = await ctx.data.getEntries(c.id, c.startDate, c.latestExecutionDate);
  const contractTotals = computeTotals(all);
  return {
    contract: toSummary(c),
    entries,
    holidays,
    periodTotals: computeTotals(entries),
    contractTotals,
    remaining: computeRemaining(c, contractTotals)
  };
}
