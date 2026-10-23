import type { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import type { IItems } from '@pnp/sp/items';
import { computeUsedTotals } from '@orpheussystems/shared-core';
import type { CalendarEntry, Contract, DateKey, EntryType, Role, UserRef } from '@orpheussystems/shared-core';
import {
  CONTRACT_EXPAND,
  CONTRACT_SELECT,
  type SPContractItem,
  contractsOfContractorQuery,
  deriveRolesForContracts,
  entriesOfContractFilter,
  isoToDateKey,
  mapContract,
  resolveListIdByUrl,
  spDayEnd,
  spDayStart,
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

/** The entries list's GUID from its web-relative URL. */
export function resolveEntriesListId(sp: SPFI, webRelativeUrl: string): Promise<string> {
  return resolveListIdByUrl(sp, webRelativeUrl);
}

/**
 * How many entries of the contract lie outside [start, end] (capped at 500 rows). Rejects on failure; the form
 * treats the warning as advisory.
 */
export async function countEntriesOutsidePeriod(
  sp: SPFI, entriesListId: string, contractId: number, start: DateKey, end: DateKey
): Promise<number> {
  const rows = await items(sp, entriesListId)
    .filter(`${entriesOfContractFilter(contractId)} and (EntryDate lt ${spDayStart(start)} or EntryDate ge ${spDayEnd(end)})`)
    .select('Id').top(500)();
  return (rows as unknown[]).length;
}

/** The stored used-days columns of a contract. */
export interface UsedDaysFields {
  OnSiteUsedDays: number;
  OffSiteUsedDays: number;
}

/**
 * The used days of the contract for `period`: every entry of the contract is read (top 5000, like the services),
 * and only those inside the period count (shared-core computeUsedTotals). Rejects on failure.
 */
export async function loadUsedDays(
  sp: SPFI, entriesListId: string, contractId: number, period: Pick<Contract, 'startDate' | 'latestExecutionDate'>
): Promise<UsedDaysFields> {
  const rows = (await items(sp, entriesListId)
    .filter(entriesOfContractFilter(contractId))
    .select('Id', 'EntryDate', 'EntryType').top(5000)()) as Array<{ Id: number; EntryDate: string; EntryType: string }>;
  const entries: CalendarEntry[] = rows.map(r => ({ id: r.Id, contractId, date: isoToDateKey(r.EntryDate), type: r.EntryType as EntryType }));
  const totals = computeUsedTotals(period, entries);
  return { OnSiteUsedDays: totals.onSiteDays, OffSiteUsedDays: totals.offSiteDays };
}

/**
 * Roles of the current user (`userId`), derived from the contracts list and the web's owners group by the shared
 * helper the header uses. Rejects on any failure, so the form can fail closed (unlike the header's loadRoles).
 */
export async function loadFormRoles(sp: SPFI, listId: string, userId: number): Promise<Role[]> {
  if (!userId) { throw new Error('The current user could not be identified.'); }
  return deriveRolesForContracts(sp, listId, userId);
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

/**
 * Adds or updates the item; resolves its id. `extra` (the recomputed used days) goes into the same write.
 * Rejects with the SharePoint message.
 */
export async function saveContract(
  sp: SPFI, listId: string, draft: ContractDraft, itemId?: number, extra?: UsedDaysFields
): Promise<number> {
  const fields = { ...draftToItem(draft), ...extra };
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
