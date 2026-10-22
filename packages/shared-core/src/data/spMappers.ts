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
  StartDate: string;
  LatestExecutionDate: string;
  OnSiteTargetDays: number | null;
  OffSiteTargetDays: number | null;
  HoursPerDay: number | null;
  Country: string;
  Status: string;
}

export interface SPEntryItem {
  Id: number;
  Contract: { Id: number };
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

/** Date-only columns are stored at midnight UTC; take the date part verbatim, never go through Date. */
export function isoToDateKey(iso: string): DateKey {
  return iso.substring(0, 10);
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
    hoursPerDay: item.HoursPerDay || 0,
    country: item.Country,
    status: item.Status as ContractStatus
  };
}

export function mapEntry(item: SPEntryItem): CalendarEntry {
  const entry: CalendarEntry = {
    id: item.Id,
    contractId: item.Contract.Id,
    date: isoToDateKey(item.EntryDate),
    type: item.EntryType as EntryType
  };
  if (item.Note) { entry.note = item.Note; }
  return entry;
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
  return {
    Title: `${contractCode} ${e.date}`,
    ContractId: e.contractId,
    EntryDate: e.date,
    EntryType: e.type,
    Note: e.note
  };
}
