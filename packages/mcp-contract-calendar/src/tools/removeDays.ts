import type { DateKey, Remaining, Totals } from '@orpheussystems/shared-core';
import { canBook } from '../domain/viewer';
import type { ToolContext } from '../domain/types';
import { contractTotals, requireOwnActiveContract } from './contractAccess';
import { ToolError, parseRange } from './dateRange';

export interface RemoveDaysResult {
  removed: DateKey[];
  notFound: DateKey[];
  failed: Array<{ date: DateKey; error: string }>;
  totals: Totals;
  remaining: Remaining;
}

export async function removeDays(
  ctx: ToolContext,
  args: { from: string; to: string; contractId: number }
): Promise<RemoveDaysResult> {
  const { viewer, data } = ctx;
  if (!canBook(viewer)) throw new ToolError('forbidden', 'Only contractors can remove days.');
  const days = parseRange(args.from, args.to);
  const c = await requireOwnActiveContract(ctx, args.contractId, 'You can only change your own active contracts.');

  const existing = new Set((await data.getEntries(c.id, days[0], days[days.length - 1])).map(e => e.date));
  const removed: DateKey[] = [];
  const notFound: DateKey[] = [];
  const failed: Array<{ date: DateKey; error: string }> = [];
  for (const day of days) {
    if (!existing.has(day)) {
      notFound.push(day);
      continue;
    }
    try {
      await data.deleteEntry(c.id, day);
      removed.push(day);
    } catch (e) {
      failed.push({ date: day, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { removed, notFound, failed, ...(await contractTotals(data, c)) };
}
