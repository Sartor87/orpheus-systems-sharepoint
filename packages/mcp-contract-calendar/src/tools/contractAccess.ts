import { computeRemaining, computeTotals } from '@orpheussystems/shared-core';
import type { IDataService, Remaining, Totals } from '@orpheussystems/shared-core';
import type { ToolContext, Viewer, VendorContract } from '../domain/types';
import { ToolError } from './dateRange';
import { findVisibleContract } from './getCalendar';

export const isMineActive = (viewer: Viewer, c: VendorContract): boolean =>
  c.contractor.id === viewer.user.id && c.status === 'Active';

/** Visible contract that belongs to the viewer and is Active; otherwise not_found / forbidden. */
export async function requireOwnActiveContract(
  ctx: ToolContext,
  contractId: number,
  forbiddenMessage: string
): Promise<VendorContract> {
  const c = await findVisibleContract(ctx, contractId, { includeClosed: true });
  if (!isMineActive(ctx.viewer, c)) throw new ToolError('forbidden', forbiddenMessage);
  return c;
}

export async function contractTotals(
  data: IDataService,
  c: VendorContract
): Promise<{ totals: Totals; remaining: Remaining }> {
  const totals = computeTotals(await data.getEntries(c.id, c.startDate, c.latestExecutionDate));
  return { totals, remaining: computeRemaining(c, totals) };
}
