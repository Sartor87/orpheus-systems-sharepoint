import type { Contract } from '@orpheussystems/shared-core';
import {
  ContractDraft, draftFromContract, findOverlaps, overlapNotice, validateContract
} from '../formModel';

const PATTERN = '^\\d{4}-[A-Za-z]+(-[A-Za-z]+)*$';

const valid: ContractDraft = {
  title: '001185_2026',
  contractCode: '1185-Jane-Doe',
  frameworkContract: 'FWC-1',
  modality: 'Hybrid',
  contractorId: 7,
  contractManagerId: 9,
  startDate: '2026-02-20',
  latestExecutionDate: '2027-02-19',
  onSiteTargetDays: 10,
  offSiteTargetDays: 20.5,
  hoursPerDay: 8,
  country: 'BG',
  status: 'Active'
};

function contract(over: Partial<Contract> & { id: number }): Contract {
  return {
    title: 'C' + over.id,
    contractCode: '1185-Jane-Doe',
    frameworkContract: '',
    modality: 'Hybrid',
    contractor: { id: 7, loginName: 'j', displayName: 'Jane', email: 'j@example.com' },
    contractManager: { id: 9, loginName: 'm', displayName: 'Mo', email: 'm@example.com' },
    startDate: '2026-01-01',
    latestExecutionDate: '2026-12-31',
    onSiteTargetDays: 1,
    offSiteTargetDays: 1,
    hoursPerDay: 8,
    country: 'BG',
    status: 'Active',
    ...over
  };
}

describe('validateContract', () => {
  it('accepts a valid draft', () => {
    expect(validateContract(valid, PATTERN)).toEqual({});
  });

  it('requires the mandatory fields', () => {
    const errors = validateContract({
      title: '', contractCode: '', frameworkContract: '', country: '', status: 'Draft'
    }, PATTERN);
    for (const k of ['title', 'contractCode', 'contractorId', 'contractManagerId', 'startDate',
      'latestExecutionDate', 'country', 'onSiteTargetDays', 'offSiteTargetDays'] as const) {
      expect(errors[k]).toBe('Required.');
    }
  });

  it('checks the code pattern', () => {
    expect(validateContract({ ...valid, contractCode: '1185-Jane-Doe' }, PATTERN).contractCode).toBeUndefined();
    expect(validateContract({ ...valid, contractCode: '1185_Jane' }, PATTERN).contractCode)
      .toBe('Use the pattern 1185-Name or 1185-First-Last.');
  });

  it('rejects an end date before the start date', () => {
    expect(validateContract({ ...valid, latestExecutionDate: '2026-02-19' }, PATTERN).latestExecutionDate)
      .toBe('Must be on or after the start date.');
    expect(validateContract({ ...valid, latestExecutionDate: '2026-02-20' }, PATTERN).latestExecutionDate)
      .toBeUndefined();
  });

  it('accepts targets in steps of 0.5 only, and not negative', () => {
    const msg = 'Use a number ≥ 0 in steps of 0.5.';
    expect(validateContract({ ...valid, onSiteTargetDays: 2.25 }, PATTERN).onSiteTargetDays).toBe(msg);
    expect(validateContract({ ...valid, onSiteTargetDays: 2.5 }, PATTERN).onSiteTargetDays).toBeUndefined();
    expect(validateContract({ ...valid, offSiteTargetDays: -1 }, PATTERN).offSiteTargetDays).toBe(msg);
    expect(validateContract({ ...valid, offSiteTargetDays: 0 }, PATTERN).offSiteTargetDays).toBeUndefined();
    expect(validateContract({ ...valid, hoursPerDay: 7.75 }, PATTERN).hoursPerDay).toBe(msg);
  });

  it('requires an upper-case two-letter country', () => {
    const msg = 'Use a 2-letter country code.';
    expect(validateContract({ ...valid, country: 'bg' }, PATTERN).country).toBe(msg);
    expect(validateContract({ ...valid, country: 'BGR' }, PATTERN).country).toBe(msg);
    expect(validateContract({ ...valid, country: 'B1' }, PATTERN).country).toBe(msg);
    expect(validateContract({ ...valid, country: 'BG' }, PATTERN).country).toBeUndefined();
  });
});

describe('findOverlaps', () => {
  const active = contract({ id: 1, title: '001185_2026', startDate: '2026-01-01', latestExecutionDate: '2027-02-19' });
  const closed = contract({ id: 2, status: 'Closed', startDate: '2026-01-01', latestExecutionDate: '2027-02-19' });
  const later = contract({ id: 3, startDate: '2027-03-01', latestExecutionDate: '2027-12-31' });

  it('returns the active overlapping contract', () => {
    expect(findOverlaps(valid, [active, later])).toEqual([active]);
  });

  it('ignores closed contracts and the contract being edited', () => {
    expect(findOverlaps(valid, [closed])).toEqual([]);
    expect(findOverlaps(valid, [active], 1)).toEqual([]);
  });

  it('treats touching periods as overlapping (inclusive)', () => {
    const touching = contract({ id: 4, startDate: '2027-02-19', latestExecutionDate: '2027-06-01' });
    expect(findOverlaps(valid, [touching])).toEqual([touching]);
  });

  it('ignores other contracts with a blank start or end date (no period to overlap)', () => {
    const noStart = contract({ id: 5, startDate: '', latestExecutionDate: '2027-02-19' });
    const noEnd = contract({ id: 6, startDate: '2026-01-01', latestExecutionDate: '' });
    expect(findOverlaps(valid, [noStart, noEnd])).toEqual([]);
  });

  it('returns nothing while the dates are incomplete', () => {
    expect(findOverlaps({ ...valid, startDate: undefined }, [active])).toEqual([]);
  });
});

describe('overlapNotice', () => {
  it('is undefined without overlaps', () => {
    expect(overlapNotice([])).toBeUndefined();
  });

  it('names a single overlap', () => {
    const c = contract({ id: 1, title: '001185_2026', latestExecutionDate: '2027-02-19' });
    expect(overlapNotice([c])).toBe('Overlaps with 001185_2026 until 19 Feb 2027 — bridge contract?');
  });

  it('joins several titles and uses the latest end date', () => {
    const a = contract({ id: 1, title: 'A', latestExecutionDate: '2027-02-19' });
    const b = contract({ id: 2, title: 'B', latestExecutionDate: '2027-09-05' });
    expect(overlapNotice([a, b])).toBe('Overlaps with A, B until 05 Sep 2027 — bridge contract?');
  });
});

describe('draftFromContract', () => {
  it('maps every field', () => {
    const c = contract({ id: 5, title: 'T', contractCode: '1185-X', frameworkContract: 'F', modality: 'On-site',
      startDate: '2026-03-01', latestExecutionDate: '2026-04-01', onSiteTargetDays: 3, offSiteTargetDays: 4.5,
      hoursPerDay: 6, country: 'DE', status: 'Draft' });
    expect(draftFromContract(c)).toEqual({
      title: 'T', contractCode: '1185-X', frameworkContract: 'F', modality: 'On-site', contractorId: 7,
      contractManagerId: 9, startDate: '2026-03-01', latestExecutionDate: '2026-04-01', onSiteTargetDays: 3,
      offSiteTargetDays: 4.5, hoursPerDay: 6, country: 'DE', status: 'Draft'
    });
  });
});

describe('draftFromContract with blank dates', () => {
  it('leaves blank dates unset so validation asks for them', () => {
    const d = draftFromContract(contract({ id: 5, startDate: '', latestExecutionDate: '' }));
    expect(d.startDate).toBeUndefined();
    expect(d.latestExecutionDate).toBeUndefined();
    expect(validateContract(d, PATTERN)).toMatchObject({ startDate: 'Required.', latestExecutionDate: 'Required.' });
  });
});

describe('robustness', () => {
  it('does not throw on an invalid code pattern and falls back to the default', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => validateContract(valid, '^(')).not.toThrow();
    expect(validateContract(valid, '^(').contractCode).toBeUndefined();
    expect(validateContract({ ...valid, contractCode: '1185_Jane' }, '^(').contractCode)
      .toBe('Use the pattern 1185-Name or 1185-First-Last.');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('findOverlaps returns nothing without a contractor, and ignores other contractors', () => {
    const other = contract({ id: 8, startDate: '2026-01-01', latestExecutionDate: '2027-12-31',
      contractor: { id: 99, loginName: 'x', displayName: 'X', email: 'x@example.com' } });
    expect(findOverlaps({ ...valid, contractorId: undefined }, [contract({ id: 9 })])).toEqual([]);
    expect(findOverlaps(valid, [other])).toEqual([]);
  });
});
