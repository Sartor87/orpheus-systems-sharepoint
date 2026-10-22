import type { Holiday } from '@orpheussystems/shared-core';
import type { ToolContext } from '../domain/types';
import { ToolError, parseRange } from './dateRange';

export async function getHolidays(
  ctx: ToolContext,
  args: { country: string; from: string; to: string }
): Promise<Holiday[]> {
  if (!/^[A-Za-z]{2}$/.test(args.country)) {
    throw new ToolError('invalid_input', `Invalid country "${args.country}"; use a 2-letter code such as BG.`);
  }
  const days = parseRange(args.from, args.to, 366);
  return ctx.data.getHolidays(args.country.toUpperCase(), days[0], days[days.length - 1]);
}
