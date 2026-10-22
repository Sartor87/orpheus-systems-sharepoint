import type { SPFI } from '@pnp/sp';
// Type-only: brings in the PnP type augmentations without loading PnP at runtime (keeps unit tests free of ESM).
// Runtime registration happens in the other modules re-exported from the sharepoint entry point.
import type {} from '@pnp/sp/webs';
import type {} from '@pnp/sp/lists';
import type {} from '@pnp/sp/items';
import { ContractTemplateData, EMPTY_TEMPLATE_DATA, parseTemplateFields } from '../templateData';

export const TEMPLATE_DATA_SELECT = ['ConsultantPosition', 'Vendor', 'Lot', 'ApproverName', 'TemplateFields'];

export interface SPTemplateDataItem {
  ConsultantPosition?: string | null;
  Vendor?: string | null;
  Lot?: string | null;
  ApproverName?: string | null;
  TemplateFields?: string | null;
}

export function mapTemplateData(item: SPTemplateDataItem): ContractTemplateData {
  return {
    position: item.ConsultantPosition || '',
    vendor: item.Vendor || '',
    lot: item.Lot || '',
    approverName: item.ApproverName || '',
    custom: parseTemplateFields(item.TemplateFields)
  };
}

/**
 * Reads the optional template columns of one contract. A 400 means the columns are not provisioned
 * on this site, which yields empty data; any other failure is rethrown.
 */
export async function getContractTemplateData(sp: SPFI, contractsListId: string, contractId: number): Promise<ContractTemplateData> {
  try {
    const item = await sp.web.lists.getById(contractsListId).items.getById(contractId).select(...TEMPLATE_DATA_SELECT)() as SPTemplateDataItem;
    return mapTemplateData(item);
  } catch (e) {
    if ((e as { status?: number } | null)?.status === 400) {
      return { ...EMPTY_TEMPLATE_DATA, custom: {} };
    }
    throw e;
  }
}
