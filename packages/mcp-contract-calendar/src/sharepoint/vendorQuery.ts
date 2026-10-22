import { CONTRACT_SELECT, mapContract } from '@orpheussystems/shared-core/lib/data/spMappers';
import type { SPContractItem } from '@orpheussystems/shared-core/lib/data/spMappers';
import type { ContractQuery, VendorContract, Viewer } from '../domain/types';

export const VENDOR_CONTRACT_SELECT = [...CONTRACT_SELECT, 'Vendor', 'OnSiteUsedDays', 'OffSiteUsedDays'];

/**
 * OData filter narrowing the directory query to what the viewer may see. The vendor is deliberately not part
 * of it (matched case-insensitively in memory). applyQuery re-checks visibility, so this is a pre-filter.
 */
export function directoryFilter(viewer: Viewer, q: ContractQuery): string {
  const parts: string[] = [];
  const id = viewer.user.id;
  const all = viewer.roles.includes('HR') || viewer.roles.includes('Admin');
  if (!all) {
    const asContractor = viewer.roles.includes('Contractor');
    const asManager = viewer.roles.includes('ContractManager');
    if (asContractor && asManager) parts.push(`(ContractorId eq ${id} or ContractManagerId eq ${id})`);
    else if (asManager) parts.push(`ContractManagerId eq ${id}`);
    else if (asContractor) parts.push(`ContractorId eq ${id}`);
    else parts.push('Id eq 0');
  }
  if (!q.includeClosed) parts.push("Status ne 'Closed'");
  if (q.managerId !== undefined) parts.push(`ContractManagerId eq ${q.managerId}`);
  return parts.join(' and ');
}

export type SPVendorContractItem = SPContractItem & {
  Vendor?: string | null;
  OnSiteUsedDays?: number | null;
  OffSiteUsedDays?: number | null;
};

export function mapVendorContract(item: SPVendorContractItem): VendorContract {
  const vendor = (item.Vendor ?? '').trim();
  return {
    ...mapContract(item),
    vendor: vendor === '' ? null : vendor,
    onSiteUsedDays: item.OnSiteUsedDays ?? 0,
    offSiteUsedDays: item.OffSiteUsedDays ?? 0
  };
}
