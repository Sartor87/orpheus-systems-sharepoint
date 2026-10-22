import { addDays } from '../dates';
import { DateKey, UserInfo } from '../models';

/**
 * Day window of a DateKey D is [(D-1)T12:00Z, DT12:00Z). It contains every representation SharePoint may return
 * for D (UTC midnight or local midnight of any site offset within +/-12 h).
 */
/** SharePoint DateTime cannot be queried below this instant. */
const SP_MIN_DATETIME = "datetime'1900-01-01T00:00:00Z'";

export function spDayStart(k: DateKey): string {
  const start = `datetime'${addDays(k, -1)}T12:00:00Z'`;
  return start < SP_MIN_DATETIME ? SP_MIN_DATETIME : start;
}

export function spDayEnd(k: DateKey): string {
  return `datetime'${k}T12:00:00Z'`;
}

function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export function contractsFilter(user: UserInfo, includeClosed: boolean): string {
  const parts: string[] = [];
  if (user.roles.indexOf('Admin') < 0) {
    parts.push(`(ContractorId eq ${user.id} or ContractManagerId eq ${user.id})`);
  }
  if (!includeClosed) { parts.push("Status ne 'Closed'"); }
  return parts.join(' and ');
}

export function entriesFilter(contractId: number, from: DateKey, to: DateKey): string {
  return `ContractId eq ${contractId} and EntryDate ge ${spDayStart(from)} and EntryDate lt ${spDayEnd(to)}`;
}

export function holidaysFilter(country: string, from: DateKey, to: DateKey): string {
  return `(Country eq ${quote(country)} or Country eq '*') and HolidayDate ge ${spDayStart(from)} and HolidayDate lt ${spDayEnd(to)}`;
}

export function entriesOnDateFilter(contractIds: number[], date: DateKey): string {
  const ids = contractIds.map(id => `ContractId eq ${id}`).join(' or ');
  return `(${ids}) and EntryDate ge ${spDayStart(date)} and EntryDate lt ${spDayEnd(date)}`;
}

export function contractsOfContractorFilter(contractorId: number): string {
  return `ContractorId eq ${contractorId}`;
}

/** Same filter, named for consumers that build their own queries (extensions). */
export const contractsOfContractorQuery = contractsOfContractorFilter;

/** All entries of one contract, no date window (used to recompute totals). */
export function entriesOfContractFilter(contractId: number): string {
  return `ContractId eq ${contractId}`;
}
