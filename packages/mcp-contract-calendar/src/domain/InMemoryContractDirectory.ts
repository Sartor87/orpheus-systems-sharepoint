import { compareKeys } from '@orpheussystems/shared-core';
import type { UserRef } from '@orpheussystems/shared-core';
import type { ContractQuery, IContractDirectory, VendorContract, Viewer } from './types';
import { isVisible } from './viewer';

const norm = (s: string | null): string => (s ?? '').trim().toLowerCase();

export class InMemoryContractDirectory implements IContractDirectory {
  constructor(private readonly contracts: VendorContract[]) {}

  async listVisible(viewer: Viewer, q: ContractQuery): Promise<VendorContract[]> {
    let r = this.contracts.filter(c => isVisible(viewer, c));
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

  async managersVisibleTo(viewer: Viewer): Promise<UserRef[]> {
    const byId = new Map<number, UserRef>();
    for (const c of this.contracts) {
      if (isVisible(viewer, c)) byId.set(c.contractManager.id, c.contractManager);
    }
    return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
}
