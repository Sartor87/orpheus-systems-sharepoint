import type { Contract } from '@orpheussystems/shared-core';
import contractsJson from '@orpheussystems/shared-core/lib/data/fixtures/contracts.json';
import { InMemoryContractDirectory } from '../domain/InMemoryContractDirectory';
import type { VendorContract } from '../domain/types';

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

export function buildLocalDirectory(): InMemoryContractDirectory {
  return new InMemoryContractDirectory(localContracts);
}
