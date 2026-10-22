import type { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import type { IItems } from '@pnp/sp/items';
import type { Contract, UserRef } from '@orpheussystems/shared-core';
import {
  CONTRACT_EXPAND,
  CONTRACT_SELECT,
  type SPContractItem,
  contractsOfContractorQuery,
  mapContract,
  toContractItem
} from '@orpheussystems/shared-core/sharepoint';
import type { ContractDraft } from './formModel';

function items(sp: SPFI, listId: string): IItems {
  return sp.web.lists.getById(listId).items;
}

/** Rejects with the SharePoint message. */
export async function loadContract(sp: SPFI, listId: string, itemId: number): Promise<Contract> {
  try {
    const item = (await items(sp, listId).getById(itemId)
      .select(...CONTRACT_SELECT).expand(...CONTRACT_EXPAND)()) as SPContractItem;
    return mapContract(item);
  } catch (e) {
    throw new Error(spErrorMessage(e));
  }
}

/** Every contract of the contractor (the form filters by status, period and self). */
export async function loadOthersOfContractor(sp: SPFI, listId: string, contractorId: number): Promise<Contract[]> {
  const rows = (await items(sp, listId)
    .filter(contractsOfContractorQuery(contractorId))
    .select(...CONTRACT_SELECT).expand(...CONTRACT_EXPAND).top(500)()) as SPContractItem[];
  return rows.map(mapContract);
}

const person = (id: number | undefined): UserRef | undefined =>
  id === undefined ? undefined : { id, loginName: '', displayName: '', email: '' };

/** List item fields for a validated draft: text trimmed, people as <Field>Id, dates as yyyy-MM-dd. */
export function draftToItem(d: ContractDraft): Record<string, unknown> {
  const item = toContractItem({
    title: d.title.trim(),
    contractCode: d.contractCode.trim(),
    frameworkContract: d.frameworkContract.trim(),
    modality: d.modality,
    contractor: person(d.contractorId),
    contractManager: person(d.contractManagerId),
    startDate: d.startDate,
    latestExecutionDate: d.latestExecutionDate,
    onSiteTargetDays: d.onSiteTargetDays,
    offSiteTargetDays: d.offSiteTargetDays,
    hoursPerDay: d.hoursPerDay,
    country: d.country.trim(),
    status: d.status
  });
  // Optional number cleared in the form: write an explicit null so an edit really clears it.
  if (d.hoursPerDay === undefined) { item.HoursPerDay = null; }
  return item;
}

/** The SharePoint message from a PnPjs request error ("… ::> {json}"), else the error's own message. */
export function spErrorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const at = message.indexOf('::>');
  if (at >= 0) {
    try {
      const body = JSON.parse(message.substring(at + 3).trim());
      const err = body['odata.error'] || body.error;
      const value = err && err.message && (typeof err.message === 'string' ? err.message : err.message.value);
      if (typeof value === 'string' && value) { return value; }
    } catch { /* not JSON: fall through */ }
  }
  return message;
}

/** Adds or updates the item; resolves its id. Rejects with the SharePoint message. */
export async function saveContract(sp: SPFI, listId: string, draft: ContractDraft, itemId?: number): Promise<number> {
  const fields = draftToItem(draft);
  try {
    if (itemId !== undefined) {
      await items(sp, listId).getById(itemId).update(fields);
      return itemId;
    }
    const added = await items(sp, listId).add(fields);
    return Number(added && (added.Id !== undefined ? added.Id : added.ID));
  } catch (e) {
    throw new Error(spErrorMessage(e));
  }
}
