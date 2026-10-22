import { CalendarEntry, Contract, DateKey, EntryType, Holiday } from '@orpheussystems/shared-core';

export function e(type: EntryType, date: DateKey = '2026-02-02', contractId: number = 1): CalendarEntry {
  return { contractId, date, type };
}

const person = { id: 1, loginName: 'jane', displayName: 'Jane Doe', email: 'jane@example.com' };

export function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 1,
    title: 'Contract',
    contractCode: '1185-Jane-Doe',
    frameworkContract: 'FWC',
    modality: 'Hybrid',
    contractor: person,
    contractManager: { ...person, id: 2, loginName: 'manager', displayName: 'Max Manager', email: 'max@example.com' },
    startDate: '2026-02-02',
    latestExecutionDate: '2027-02-19',
    onSiteTargetDays: 10,
    offSiteTargetDays: 10,
    hoursPerDay: 8,
    country: 'BG',
    status: 'Active',
    ...overrides
  };
}

export function hol(date: DateKey, country: string): Holiday {
  return { title: 'Holiday', date, country, source: 'Manual' };
}

export const labels = { approvingOrg: 'Client approval', serviceProvider: 'Service provider' };
