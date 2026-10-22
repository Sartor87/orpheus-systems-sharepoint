import type { UserRef } from '@orpheussystems/shared-core';
import type { ContractQuery, IContractDirectory, VendorContract, Viewer } from './types';
import { isVisible } from './viewer';
import { applyQuery } from './applyQuery';

export class InMemoryContractDirectory implements IContractDirectory {
  constructor(private readonly contracts: VendorContract[]) {}

  async listVisible(viewer: Viewer, q: ContractQuery): Promise<VendorContract[]> {
    return applyQuery(this.contracts, viewer, q);
  }

  async managersVisibleTo(viewer: Viewer): Promise<UserRef[]> {
    const byId = new Map<number, UserRef>();
    for (const c of this.contracts) {
      if (isVisible(viewer, c)) byId.set(c.contractManager.id, c.contractManager);
    }
    return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
}
