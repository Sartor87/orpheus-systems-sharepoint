import { LocalDataService } from '@orpheussystems/shared-core';
import type { Contract } from '@orpheussystems/shared-core';
import contractsJson from '@orpheussystems/shared-core/lib/data/fixtures/contracts.json';
import { InMemoryContractDirectory } from '../domain/InMemoryContractDirectory';
import type { ToolContext, VendorContract } from '../domain/types';

const VENDORS: Record<number, string> = {
  1: 'Kuker Consulting',
  2: 'Kuker Consulting',
  3: 'Samodiva Systems',
  4: 'Kuker Consulting'
};

export const localContracts: VendorContract[] = (contractsJson as unknown as Contract[]).map(c => ({
  ...c,
  vendor: VENDORS[c.id] ?? null,
  onSiteUsedDays: 0,
  offSiteUsedDays: 0
}));

export async function localContext(demoUserId: number): Promise<ToolContext> {
  const data = new LocalDataService({ demoUserId });
  const me = await data.getCurrentUser();
  return {
    viewer: { user: { id: me.id, loginName: me.loginName, displayName: me.displayName, email: me.email }, roles: me.roles },
    data,
    directory: new InMemoryContractDirectory(localContracts),
    today: '2026-10-22'
  };
}
