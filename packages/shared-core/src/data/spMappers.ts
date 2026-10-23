import { CalendarEntry, Contract, ContractStatus, DateKey, EntryType, Holiday, Modality, UserRef } from '../models';

export interface SPUserField { Id: number; Title: string; EMail: string; Name: string }

export interface SPContractItem {
  Id: number;
  Title: string;
  ContractCode: string;
  FrameworkContract: string;
  Modality: string;
  Contractor: SPUserField | null;
  ContractManager: SPUserField | null;
  /** Not required in the list: null when blank. */
  StartDate: string | null;
  LatestExecutionDate: string | null;
  OnSiteTargetDays: number | null;
  OffSiteTargetDays: number | null;
  HoursPerDay: number | null;
  Country: string;
  Status: string;
}

export interface SPEntryItem {
  Id: number;
  /** null when the lookup target was deleted (the lookup has no delete behaviour). */
  Contract: { Id: number } | null;
  EntryDate: string;
  EntryType: string;
  Note?: string | null;
}

export interface SPHolidayItem {
  Id: number;
  Title: string;
  HolidayDate: string;
  Country: string;
  Source: string;
}

/** Select/expand lists matching the mapped columns. */
export const CONTRACT_SELECT = [
  'Id', 'Title', 'ContractCode', 'FrameworkContract', 'Modality',
  'Contractor/Id', 'Contractor/Title', 'Contractor/EMail', 'Contractor/Name',
  'ContractManager/Id', 'ContractManager/Title', 'ContractManager/EMail', 'ContractManager/Name',
  'StartDate', 'LatestExecutionDate', 'OnSiteTargetDays', 'OffSiteTargetDays', 'HoursPerDay', 'Country', 'Status'
];
export const CONTRACT_EXPAND = ['Contractor', 'ContractManager'];
export const ENTRY_SELECT = ['Id', 'Contract/Id', 'EntryDate', 'EntryType', 'Note'];
export const ENTRY_EXPAND = ['Contract'];
export const HOLIDAY_SELECT = ['Id', 'Title', 'HolidayDate', 'Country', 'Source'];

/**
 * Date-only columns come back as a UTC instant of the site's local midnight (e.g. 2026-02-05T22:00:00Z for
 * 6 Feb on a UTC+2 site) or as plain UTC midnight. Round to the nearest UTC midnight (add 12 h, take the UTC date).
 * Correct for any site offset within +/-12 h.
 * A blank (null, undefined, empty) or unreadable value maps to '' (no date), never throws.
 */
export function isoToDateKey(iso: string | null | undefined): DateKey {
  const s = (iso || '').trim();
  if (!s) { return ''; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { return s; }
  const ms = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : s + 'Z');
  if (isNaN(ms)) { return ''; }
  return new Date(ms + 12 * 3600 * 1000).toISOString().substring(0, 10);
}

/** HoursPerDay column default; a blank value means the default, not 0 hours. */
export const DEFAULT_HOURS_PER_DAY = 8;

const ENTRY_TYPES: EntryType[] = ['OnSiteFull', 'OnSiteHalf', 'OffSiteFull', 'OffSiteHalf'];

export function isKnownEntryType(t: string): t is EntryType {
  return ENTRY_TYPES.indexOf(t as EntryType) >= 0;
}

function mapUser(u: SPUserField | null): UserRef {
  if (!u) { return { id: 0, loginName: '', displayName: '', email: '' }; }
  return { id: u.Id, loginName: u.Name || '', displayName: u.Title || '', email: u.EMail || '' };
}

export function mapContract(item: SPContractItem): Contract {
  return {
    id: item.Id,
    title: item.Title,
    contractCode: item.ContractCode,
    frameworkContract: item.FrameworkContract,
    modality: item.Modality as Modality,
    contractor: mapUser(item.Contractor),
    contractManager: mapUser(item.ContractManager),
    startDate: isoToDateKey(item.StartDate),
    latestExecutionDate: isoToDateKey(item.LatestExecutionDate),
    onSiteTargetDays: item.OnSiteTargetDays || 0,
    offSiteTargetDays: item.OffSiteTargetDays || 0,
    hoursPerDay: item.HoursPerDay === null || item.HoursPerDay === undefined ? DEFAULT_HOURS_PER_DAY : item.HoursPerDay,
    country: item.Country || '',
    status: item.Status as ContractStatus
  };
}

export function mapEntry(item: SPEntryItem): CalendarEntry {
  const entry: CalendarEntry = {
    id: item.Id,
    contractId: item.Contract ? item.Contract.Id : 0,
    date: isoToDateKey(item.EntryDate),
    type: item.EntryType as EntryType
  };
  if (item.Note) { entry.note = item.Note; }
  return entry;
}

/**
 * Maps entry rows, leaving out rows that cannot be counted: an orphaned Contract lookup, a blank date or an
 * EntryType outside the four known values (a renamed choice would otherwise crash the grid and miscount totals).
 */
export function mapEntries(items: SPEntryItem[]): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  for (const item of items) {
    const e = mapEntry(item);
    if (e.contractId && e.date && isKnownEntryType(e.type)) { out.push(e); }
    else { console.warn(`Skipped calendar entry ${item.Id}: no contract, date or known type`); }
  }
  return out;
}

export function mapHoliday(item: SPHolidayItem): Holiday {
  return {
    id: item.Id,
    title: item.Title,
    date: isoToDateKey(item.HolidayDate),
    country: item.Country,
    source: item.Source as Holiday['source']
  };
}

export function toContractItem(c: Partial<Contract>): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  if (c.title !== undefined) { item.Title = c.title; }
  if (c.contractCode !== undefined) { item.ContractCode = c.contractCode; }
  if (c.frameworkContract !== undefined) { item.FrameworkContract = c.frameworkContract; }
  if (c.modality !== undefined) { item.Modality = c.modality; }
  if (c.contractor !== undefined) { item.ContractorId = c.contractor.id; }
  if (c.contractManager !== undefined) { item.ContractManagerId = c.contractManager.id; }
  if (c.startDate !== undefined) { item.StartDate = c.startDate; }
  if (c.latestExecutionDate !== undefined) { item.LatestExecutionDate = c.latestExecutionDate; }
  if (c.onSiteTargetDays !== undefined) { item.OnSiteTargetDays = c.onSiteTargetDays; }
  if (c.offSiteTargetDays !== undefined) { item.OffSiteTargetDays = c.offSiteTargetDays; }
  if (c.hoursPerDay !== undefined) { item.HoursPerDay = c.hoursPerDay; }
  if (c.country !== undefined) { item.Country = c.country; }
  if (c.status !== undefined) { item.Status = c.status; }
  return item;
}

export function toEntryItem(e: CalendarEntry, contractCode: string): Record<string, unknown> {
  // Dates are written as plain yyyy-MM-dd. SharePoint stores them as site-local midnight and may return them
  // as T00:00:00Z or as the local-midnight instant (e.g. 22:00Z the day before), so reads go through
  // isoToDateKey, which normalises both forms.
  return {
    Title: `${contractCode} ${e.date}`,
    ContractId: e.contractId,
    EntryDate: e.date,
    EntryType: e.type,
    Note: e.note
  };
}
