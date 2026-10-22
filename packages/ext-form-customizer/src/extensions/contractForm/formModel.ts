import { compareKeys } from '@orpheussystems/shared-core';
import type { Contract, ContractStatus, DateKey, Modality } from '@orpheussystems/shared-core';

export interface ContractDraft {
  title: string;
  contractCode: string;
  frameworkContract: string;
  modality?: Modality;
  contractorId?: number;
  contractManagerId?: number;
  startDate?: DateKey;
  latestExecutionDate?: DateKey;
  onSiteTargetDays?: number;
  offSiteTargetDays?: number;
  hoursPerDay?: number;
  country: string;
  status: ContractStatus;
}

export type FieldErrors = Partial<Record<keyof ContractDraft, string>>;

const REQUIRED = 'Required.';
const CODE_PATTERN_MESSAGE = 'Use the pattern 1185-Name or 1185-First-Last.';
const END_BEFORE_START = 'Must be on or after the start date.';
const NUMBER_MESSAGE = 'Use a number ≥ 0 in steps of 0.5.';
const COUNTRY_MESSAGE = 'Use a 2-letter country code.';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isBlank(v: string | undefined): boolean {
  return v === undefined || v.trim() === '';
}

function isHalfStep(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n * 2);
}

export function validateContract(d: ContractDraft, codePattern: string): FieldErrors {
  const errors: FieldErrors = {};

  if (isBlank(d.title)) { errors.title = REQUIRED; }

  if (isBlank(d.contractCode)) {
    errors.contractCode = REQUIRED;
  } else if (!codeRegExp(codePattern).test(d.contractCode.trim())) {
    errors.contractCode = CODE_PATTERN_MESSAGE;
  }

  if (d.contractorId === undefined) { errors.contractorId = REQUIRED; }
  if (d.contractManagerId === undefined) { errors.contractManagerId = REQUIRED; }
  if (isBlank(d.startDate)) { errors.startDate = REQUIRED; }

  if (isBlank(d.latestExecutionDate)) {
    errors.latestExecutionDate = REQUIRED;
  } else if (!isBlank(d.startDate) && compareKeys(d.latestExecutionDate as DateKey, d.startDate as DateKey) < 0) {
    errors.latestExecutionDate = END_BEFORE_START;
  }

  for (const key of ['onSiteTargetDays', 'offSiteTargetDays'] as const) {
    const v = d[key];
    if (v === undefined) {
      errors[key] = REQUIRED;
    } else if (!isHalfStep(v)) {
      errors[key] = NUMBER_MESSAGE;
    }
  }
  if (d.hoursPerDay !== undefined && !isHalfStep(d.hoursPerDay)) {
    errors.hoursPerDay = NUMBER_MESSAGE;
  }

  if (isBlank(d.country)) {
    errors.country = REQUIRED;
  } else if (!/^[A-Z]{2}$/.test(d.country)) {
    errors.country = COUNTRY_MESSAGE;
  }

  return errors;
}

/** Active/Draft contracts of the same contractor whose period intersects the draft's (inclusive). */
export function findOverlaps(d: ContractDraft, othersOfContractor: Contract[], selfId?: number): Contract[] {
  const { startDate, latestExecutionDate } = d;
  if (!startDate || !latestExecutionDate) { return []; }
  return othersOfContractor.filter(c =>
    c.id !== selfId &&
    c.status !== 'Closed' &&
    (d.contractorId === undefined || c.contractor.id === d.contractorId) &&
    compareKeys(c.startDate, latestExecutionDate) <= 0 &&
    compareKeys(c.latestExecutionDate, startDate) >= 0
  );
}

function formatKey(k: DateKey): string {
  const [y, m, day] = k.split('-');
  return `${day} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function overlapNotice(o: Contract[]): string | undefined {
  if (o.length === 0) { return undefined; }
  const latest = o.map(c => c.latestExecutionDate).reduce((a, b) => (compareKeys(a, b) >= 0 ? a : b));
  return `Overlaps with ${o.map(c => c.title).join(', ')} until ${formatKey(latest)} — bridge contract?`;
}

export function draftFromContract(c: Contract): ContractDraft {
  return {
    title: c.title,
    contractCode: c.contractCode,
    frameworkContract: c.frameworkContract,
    modality: c.modality,
    contractorId: c.contractor.id,
    contractManagerId: c.contractManager.id,
    startDate: c.startDate,
    latestExecutionDate: c.latestExecutionDate,
    onSiteTargetDays: c.onSiteTargetDays,
    offSiteTargetDays: c.offSiteTargetDays,
    hoursPerDay: c.hoursPerDay,
    country: c.country,
    status: c.status
  };
}

function codeRegExp(pattern: string): RegExp {
  // The pattern is configurable (admin-supplied), so it cannot be a string constant.
  // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
  return new RegExp(pattern);
}
