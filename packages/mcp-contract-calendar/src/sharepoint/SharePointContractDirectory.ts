import type { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { CONTRACT_EXPAND } from '@orpheussystems/shared-core/lib/data/spMappers';
import type { UserRef } from '@orpheussystems/shared-core';
import type { ContractQuery, IContractDirectory, VendorContract, Viewer } from '../domain/types';
import { applyQuery } from '../domain/applyQuery';
import { directoryFilter, mapVendorContract, VENDOR_CONTRACT_SELECT } from './vendorQuery';
import type { SPVendorContractItem } from './vendorQuery';

export class SharePointContractDirectory implements IContractDirectory {
  constructor(private readonly sp: SPFI, private readonly contractsListId: string) {}

  async listVisible(viewer: Viewer, q: ContractQuery): Promise<VendorContract[]> {
    const filter = directoryFilter(viewer, q);
    let query = this.sp.web.lists
      .getById(this.contractsListId)
      .items.select(...VENDOR_CONTRACT_SELECT)
      .expand(...CONTRACT_EXPAND)
      .top(5000);
    if (filter) query = query.filter(filter);
    const items = (await query()) as SPVendorContractItem[];
    return applyQuery(items.map(mapVendorContract), viewer, q);
  }

  async managersVisibleTo(viewer: Viewer): Promise<UserRef[]> {
    const all = await this.listVisible(viewer, { includeClosed: true });
    const byId = new Map<number, UserRef>();
    for (const c of all) byId.set(c.contractManager.id, c.contractManager);
    return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
}
