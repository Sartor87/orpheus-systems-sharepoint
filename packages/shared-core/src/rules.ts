import { CalendarEntry, Contract, DateKey, EntryType, Holiday, Role } from './models';
import { isWeekend, isWithin } from './dates';

export interface Totals {
  onSiteFull: number;
  onSiteHalf: number;
  offSiteFull: number;
  offSiteHalf: number;
  onSiteDays: number;
  offSiteDays: number;
  totalDays: number;
}

export interface Remaining {
  onSite: number;
  offSite: number;
  total: number;
  onSiteOver: boolean;
  offSiteOver: boolean;
}

export function dayValue(type: EntryType): 1 | 0.5 {
  return type === 'OnSiteFull' || type === 'OffSiteFull' ? 1 : 0.5;
}

export function isOnSite(type: EntryType): boolean {
  return type === 'OnSiteFull' || type === 'OnSiteHalf';
}

export function hoursFor(type: EntryType, hoursPerDay: number): number {
  return dayValue(type) * hoursPerDay;
}

export function computeTotals(entries: CalendarEntry[]): Totals {
  const t: Totals = { onSiteFull: 0, onSiteHalf: 0, offSiteFull: 0, offSiteHalf: 0, onSiteDays: 0, offSiteDays: 0, totalDays: 0 };
  for (const entry of entries) {
    const v = dayValue(entry.type);
    if (entry.type === 'OnSiteFull') { t.onSiteFull++; }
    else if (entry.type === 'OnSiteHalf') { t.onSiteHalf++; }
    else if (entry.type === 'OffSiteFull') { t.offSiteFull++; }
    else { t.offSiteHalf++; }
    if (isOnSite(entry.type)) { t.onSiteDays += v; } else { t.offSiteDays += v; }
  }
  t.totalDays = t.onSiteDays + t.offSiteDays;
  return t;
}

export function computeRemaining(contract: Contract, totals: Totals): Remaining {
  const onSite = contract.onSiteTargetDays - totals.onSiteDays;
  const offSite = contract.offSiteTargetDays - totals.offSiteDays;
  return { onSite, offSite, total: onSite + offSite, onSiteOver: onSite < 0, offSiteOver: offSite < 0 };
}

export function usageRatio(used: number, target: number): number {
  return target === 0 ? 0 : used / target;
}

/** Both dates set. A contract item can have a blank date (the list does not require them); it covers no day. */
export function hasContractPeriod(c: Pick<Contract, 'startDate' | 'latestExecutionDate'>): boolean {
  return !!c.startDate && !!c.latestExecutionDate;
}

export function contractsCoveringDate(contracts: Contract[], date: DateKey): Contract[] {
  return contracts.filter(c => hasContractPeriod(c) && isWithin(date, c.startDate, c.latestExecutionDate));
}

function normaliseCountry(c: string | null | undefined): string {
  return (c || '').trim().toUpperCase();
}

/** A holiday applies to a contract when it is for all countries ('*') or for the contract's country, in any case. */
export function holidayApplies(holidayCountry: string, contractCountry: string): boolean {
  const h = normaliseCountry(holidayCountry);
  return h === '*' || (h !== '' && h === normaliseCountry(contractCountry));
}

export function isBlocked(date: DateKey, holidays: Holiday[], country: string, blockWeekends: boolean): boolean {
  if (blockWeekends && isWeekend(date)) { return true; }
  return holidays.some(h => h.date === date && holidayApplies(h.country, country));
}

/**
 * Server-side of the calendar's read-only rule (UI checks are not enough: the agent and other clients write too).
 * Throws when the days of `contract` may not be changed by `userId`: a Closed contract, someone other than its
 * contractor, or a contract without a period.
 */
export function assertCanWriteDays(contract: Pick<Contract, 'title' | 'status' | 'contractor' | 'startDate' | 'latestExecutionDate'>, userId: number): void {
  if (contract.status === 'Closed') { throw new Error(`Contract ${contract.title} is closed; its days cannot be changed`); }
  if (!userId || contract.contractor.id !== userId) { throw new Error(`Only the contractor of ${contract.title} can change its days`); }
  if (!hasContractPeriod(contract)) { throw new Error(`Contract ${contract.title} has no start or end date`); }
}

/** A day held by a Closed contract must not be moved off it by a write to a sibling contract. */
export function assertNotClosedSibling(sibling: Pick<Contract, 'title' | 'status'>): void {
  if (sibling.status === 'Closed') {
    throw new Error(`This day is counted against ${sibling.title}, which is closed; it cannot be moved`);
  }
}

/** May create contracts: an Admin, or a user who manages at least one contract. UI gate only (spec: no item permissions). */
export function canCreateContract(roles: Role[]): boolean {
  return roles.indexOf('Admin') >= 0 || roles.indexOf('ContractManager') >= 0;
}

/** May edit this contract: an Admin, or its own contract manager (`userId` is the current user's id). */
export function canEditContract(roles: Role[], contract: Pick<Contract, 'contractManager'>, userId: number): boolean {
  if (roles.indexOf('Admin') >= 0) { return true; }
  return roles.indexOf('ContractManager') >= 0 && !!userId && contract.contractManager.id === userId;
}

/** Title of the SharePoint group whose members may create contracts (provisioned by the infra script). */
export const CONTRACT_MANAGERS_GROUP = 'Orpheus Contract Managers';
