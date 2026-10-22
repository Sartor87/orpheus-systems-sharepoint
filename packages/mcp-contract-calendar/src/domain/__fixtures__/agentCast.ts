import type { UserRef } from '@orpheussystems/shared-core';
import type { VendorContract } from '../types';

const u = (id: number, displayName: string): UserRef => {
  const local = displayName.toLowerCase().replace(' ', '.');
  return { id, loginName: `${local}@example.com`, displayName, email: `${local}@example.com` };
};

export const CAST = {
  ivanD: u(101, 'Ivan Draganov'),
  emilia: u(102, 'Emilia Petkova'),
  alex: u(103, 'Alex Stoyanov'),
  ionna: u(104, 'Ionna Marinova'),
  boyan: u(105, 'Boyan Kolev'),
  ivanI: u(106, 'Ivan Ivanov')
};

const mk = (
  id: number, title: string, code: string, contractor: UserRef, manager: UserRef,
  vendor: string, startDate: string, latestExecutionDate: string,
  status: VendorContract['status'], on: number, off: number
): VendorContract => ({
  id, title, contractCode: code, frameworkContract: 'FW-2026-DEMO', modality: 'Hybrid',
  contractor, contractManager: manager, startDate, latestExecutionDate,
  onSiteTargetDays: 120, offSiteTargetDays: 60, hoursPerDay: 8, country: 'BG',
  status, vendor, onSiteUsedDays: on, offSiteUsedDays: off
});

export const AGENT_CONTRACTS: VendorContract[] = [
  mk(2101, '002101_2026', '2101-Ionna-Marinova', CAST.ionna, CAST.ivanD, 'Samodiva Systems', '2026-03-02', '2026-12-18', 'Active', 10, 4),
  mk(2102, '002102_2026', '2102-Alex-Stoyanov', CAST.alex, CAST.ivanD, 'Kuker Consulting', '2026-01-12', '2026-11-30', 'Active', 20, 8),
  mk(2103, '002103_2027', '2103-Alex-Stoyanov', CAST.alex, CAST.ivanD, 'Kuker Consulting', '2026-11-16', '2027-10-29', 'Active', 0, 0),
  mk(2104, '002104_2026', '2104-Boyan-Kolev', CAST.boyan, CAST.ivanD, 'Sofia SharePoint Chads', '2026-05-04', '2027-04-30', 'Active', 5, 2),
  mk(2105, '002105_2026', '2105-Boyan-Kolev', CAST.boyan, CAST.ivanI, 'Kuker Consulting', '2026-06-01', '2026-12-31', 'Active', 3, 1),
  mk(2199, '002199_2025', '2199-Ionna-Marinova', CAST.ionna, CAST.ivanD, 'Samodiva Systems', '2025-02-03', '2025-12-19', 'Closed', 100, 50)
];
