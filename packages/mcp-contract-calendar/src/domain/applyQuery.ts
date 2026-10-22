import { compareKeys } from '@orpheussystems/shared-core';
import type { ContractQuery, VendorContract, Viewer } from './types';
import { isVisible } from './viewer';

const norm = (s: string | null): string => (s ?? '').trim().toLowerCase();

/** Visibility, closed / vendor / manager filtering and ordering shared by every IContractDirectory. */
export function applyQuery(contracts: VendorContract[], viewer: Viewer, q: ContractQuery): VendorContract[] {
  let r = contracts.filter(c => isVisible(viewer, c));
  if (!q.includeClosed) r = r.filter(c => c.status !== 'Closed');
  if (q.vendor !== undefined) r = r.filter(c => norm(c.vendor) === norm(q.vendor!));
  if (q.managerId !== undefined) r = r.filter(c => c.contractManager.id === q.managerId);
  return [...r].sort((a, b) => {
    if (a.vendor === null && b.vendor !== null) return 1;
    if (a.vendor !== null && b.vendor === null) return -1;
    const v = norm(a.vendor).localeCompare(norm(b.vendor));
    return v !== 0 ? v : compareKeys(a.startDate, b.startDate);
  });
}
