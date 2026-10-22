import { computeRemaining, computeTotals, contractsCoveringDate, isBlocked, isWeekend } from '@orpheussystems/shared-core';
import type { DateKey, EntryType, Holiday, Remaining, Totals } from '@orpheussystems/shared-core';
import { canBook } from '../domain/viewer';
import type { ToolContext, VendorContract } from '../domain/types';
import { ToolError, parseRange } from './dateRange';
import { findVisibleContract } from './getCalendar';

export type SkipReason = 'weekend' | 'holiday' | 'outside_contract';

export type BookDaysResult =
  | {
      status: 'done';
      booked: Array<{ date: DateKey; contractId: number; contractTitle: string }>;
      skipped: Array<{ date: DateKey; reason: SkipReason }>;
      failed: Array<{ date: DateKey; error: string }>;
      totals: Array<{ contractId: number; contractTitle: string; totals: Totals; remaining: Remaining }>;
    }
  | {
      status: 'needs_choice';
      question: string;
      dates: DateKey[];
      candidates: Array<{ contractId: number; title: string; vendor: string | null }>;
    };

export async function bookDays(
  ctx: ToolContext,
  args: { from: string; to: string; type?: EntryType; contractId?: number; note?: string }
): Promise<BookDaysResult> {
  const { viewer, data } = ctx;
  if (!canBook(viewer)) throw new ToolError('forbidden', 'Only contractors can book days.');
  const days = parseRange(args.from, args.to);
  const type: EntryType = args.type ?? 'OnSiteFull';
  const first = days[0];
  const last = days[days.length - 1];

  const isMineActive = (c: VendorContract) => c.contractor.id === viewer.user.id && c.status === 'Active';
  let pool: VendorContract[];
  if (args.contractId !== undefined) {
    const c = await findVisibleContract(ctx, args.contractId, { includeClosed: true });
    if (!isMineActive(c)) throw new ToolError('forbidden', 'You can only book on your own active contracts.');
    pool = [c];
  } else {
    pool = (await ctx.directory.listVisible(viewer, {})).filter(isMineActive);
  }

  const holidays = new Map<string, Holiday[]>();
  for (const country of new Set(pool.map(c => c.country))) {
    holidays.set(country, await data.getHolidays(country, first, last));
  }

  const skipped: Array<{ date: DateKey; reason: SkipReason }> = [];
  const plan: Array<{ date: DateKey; candidates: VendorContract[] }> = [];
  for (const day of days) {
    if (isWeekend(day)) {
      skipped.push({ date: day, reason: 'weekend' });
      continue;
    }
    const covering = contractsCoveringDate(pool, day) as VendorContract[];
    if (covering.length === 0) {
      skipped.push({ date: day, reason: 'outside_contract' });
      continue;
    }
    const open = covering.filter(c => !isBlocked(day, holidays.get(c.country) ?? [], c.country, false));
    if (open.length === 0) {
      skipped.push({ date: day, reason: 'holiday' });
      continue;
    }
    plan.push({ date: day, candidates: open });
  }

  const ambiguous = plan.filter(p => p.candidates.length > 1);
  if (ambiguous.length > 0) {
    const dates = ambiguous.map(p => p.date);
    const seen = new Map<number, VendorContract>();
    for (const p of ambiguous) for (const c of p.candidates) seen.set(c.id, c);
    return {
      status: 'needs_choice',
      question: `Which contract should ${dates.join(', ')} count against?`,
      dates,
      candidates: [...seen.values()].map(c => ({ contractId: c.id, title: c.title, vendor: c.vendor }))
    };
  }

  const booked: Array<{ date: DateKey; contractId: number; contractTitle: string }> = [];
  const failed: Array<{ date: DateKey; error: string }> = [];
  const touched = new Map<number, VendorContract>();
  for (const p of plan) {
    const c = p.candidates[0];
    try {
      await data.upsertEntry({ contractId: c.id, date: p.date, type, note: args.note });
      booked.push({ date: p.date, contractId: c.id, contractTitle: c.title });
      touched.set(c.id, c);
    } catch (e) {
      failed.push({ date: p.date, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const totals: Array<{ contractId: number; contractTitle: string; totals: Totals; remaining: Remaining }> = [];
  for (const c of touched.values()) {
    const t = computeTotals(await data.getEntries(c.id, c.startDate, c.latestExecutionDate));
    totals.push({ contractId: c.id, contractTitle: c.title, totals: t, remaining: computeRemaining(c, t) });
  }
  return { status: 'done', booked, skipped, failed, totals };
}
