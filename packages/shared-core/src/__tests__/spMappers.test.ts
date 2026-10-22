import { isoToDateKey, mapContract, mapEntry, mapHoliday, toEntryItem, SPContractItem } from '../data/spMappers';

const contractItem: SPContractItem = {
  Id: 3,
  Title: 'Specific Contract 3',
  ContractCode: '1185-Jane-Doe',
  FrameworkContract: 'FWC-2025',
  Modality: 'Hybrid',
  Contractor: { Id: 7, Title: 'Jane Doe', EMail: 'jane@example.com', Name: 'i:0#.f|membership|jane@example.com' },
  ContractManager: { Id: 8, Title: 'Max Manager', EMail: 'max@example.com', Name: 'i:0#.f|membership|max@example.com' },
  StartDate: '2026-02-02T00:00:00Z',
  LatestExecutionDate: '2027-02-19T00:00:00Z',
  OnSiteTargetDays: 40,
  OffSiteTargetDays: 120.5,
  HoursPerDay: 8,
  Country: 'BG',
  Status: 'Active'
};

describe('isoToDateKey', () => {
  it.each([
    ['2026-02-06T00:00:00Z', '2026-02-06'],
    ['2026-02-05T22:00:00Z', '2026-02-06'],
    ['2026-07-05T21:00:00Z', '2026-07-06'],
    ['2026-02-06T05:00:00Z', '2026-02-06'],
    ['2026-02-06', '2026-02-06'],
    ['2026-12-31T22:00:00Z', '2027-01-01']
  ])('%s -> %s', (iso, key) => {
    expect(isoToDateKey(iso)).toBe(key);
  });
});

describe('spMappers', () => {
  it('mapContract maps people, dates and numbers', () => {
    const c = mapContract(contractItem);
    expect(c.id).toBe(3);
    expect(c.title).toBe('Specific Contract 3');
    expect(c.contractor).toEqual({ id: 7, displayName: 'Jane Doe', email: 'jane@example.com', loginName: 'i:0#.f|membership|jane@example.com' });
    expect(c.contractManager.id).toBe(8);
    expect(c.startDate).toBe('2026-02-02');
    expect(c.latestExecutionDate).toBe('2027-02-19');
    expect(c.onSiteTargetDays).toBe(40);
    expect(c.offSiteTargetDays).toBe(120.5);
    expect(c.hoursPerDay).toBe(8);
    expect(c.modality).toBe('Hybrid');
    expect(c.status).toBe('Active');
    expect(c.country).toBe('BG');
  });

  it('mapContract tolerates null numerics and missing people', () => {
    const c = mapContract({ ...contractItem, OnSiteTargetDays: null, Contractor: null });
    expect(c.onSiteTargetDays).toBe(0);
    expect(c.contractor.id).toBe(0);
  });

  it('mapEntry maps lookup, date and optional note', () => {
    const e = mapEntry({ Id: 11, Contract: { Id: 3 }, EntryDate: '2026-03-04T00:00:00Z', EntryType: 'OnSiteHalf', Note: null });
    expect(e).toEqual({ id: 11, contractId: 3, date: '2026-03-04', type: 'OnSiteHalf' });
    expect(mapEntry({ Id: 12, Contract: { Id: 3 }, EntryDate: '2026-03-05T00:00:00Z', EntryType: 'OffSiteFull', Note: 'wfh' }).note).toBe('wfh');
  });

  it('mapHoliday maps fields', () => {
    expect(mapHoliday({ Id: 2, Title: 'Liberation Day', HolidayDate: '2026-03-03T00:00:00Z', Country: '*', Source: 'Agent' }))
      .toEqual({ id: 2, title: 'Liberation Day', date: '2026-03-03', country: '*', source: 'Agent' });
  });

  it('toEntryItem produces the list item payload', () => {
    expect(toEntryItem({ contractId: 3, date: '2026-03-04', type: 'OnSiteFull', note: 'x' }, '1185-Jane-Doe')).toEqual({
      Title: '1185-Jane-Doe 2026-03-04',
      ContractId: 3,
      EntryDate: '2026-03-04',
      EntryType: 'OnSiteFull',
      Note: 'x'
    });
  });
});
