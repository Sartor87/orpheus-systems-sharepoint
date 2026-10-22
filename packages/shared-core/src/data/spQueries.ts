import { addDays } from '../dates';
import { DateKey, UserInfo } from '../models';

/** Date-only SharePoint columns are compared at midnight UTC. */
export function spDate(k: DateKey): string {
  return `datetime'${k}T00:00:00Z'`;
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
  return `ContractId eq ${contractId} and EntryDate ge ${spDate(from)} and EntryDate le ${spDate(to)}`;
}

export function holidaysFilter(country: string, from: DateKey, to: DateKey): string {
  return `(Country eq ${quote(country)} or Country eq '*') and HolidayDate ge ${spDate(from)} and HolidayDate le ${spDate(to)}`;
}

export function entriesOnDateFilter(contractIds: number[], date: DateKey): string {
  const ids = contractIds.map(id => `ContractId eq ${id}`).join(' or ');
  return `(${ids}) and EntryDate ge ${spDate(date)} and EntryDate lt ${spDate(addDays(date, 1))}`;
}

export function contractsOfContractorFilter(contractorId: number): string {
  return `ContractorId eq ${contractorId}`;
}
