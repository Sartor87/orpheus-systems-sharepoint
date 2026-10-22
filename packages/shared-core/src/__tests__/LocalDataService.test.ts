import { LocalDataService } from '../data/LocalDataService';

describe('LocalDataService', () => {
  test('contractor sees only own active contracts', async () => {
    const svc = new LocalDataService({ demoUserId: 1 });
    expect((await svc.getMyContracts()).map(c => c.contractCode)).toEqual(['1185-Jane-Doe', '1186-Jane-Doe']);
  });
  test('manager sees all contracts they manage', async () => {
    expect((await new LocalDataService({ demoUserId: 3 }).getMyContracts()).length).toBe(3);
  });
  test('admin sees all active contracts', async () => {
    expect((await new LocalDataService({ demoUserId: 4 }).getMyContracts()).length).toBe(3);
  });
  test('upsert moves an entry between bridge contracts and keeps one per date', async () => {
    const svc = new LocalDataService({ demoUserId: 1 });
    await svc.upsertEntry({ contractId: 1, date: '2027-02-05', type: 'OnSiteFull' });
    await svc.upsertEntry({ contractId: 2, date: '2027-02-05', type: 'OffSiteHalf' });
    expect(await svc.getEntries(1, '2027-02-05', '2027-02-05')).toEqual([]);
    expect((await svc.getEntries(2, '2027-02-05', '2027-02-05'))[0]).toMatchObject({ type: 'OffSiteHalf' });
  });
  test('upsert on a blocked date rejects', async () => {
    await expect(new LocalDataService({ demoUserId: 1 }).upsertEntry({ contractId: 1, date: '2026-12-25', type: 'OnSiteFull' })).rejects.toThrow(/blocked/i);
  });
  test('upsert on a weekend rejects', async () => {
    await expect(new LocalDataService({ demoUserId: 1 }).upsertEntry({ contractId: 1, date: '2026-06-06', type: 'OnSiteFull' })).rejects.toThrow(/blocked/i);
  });
  test('upsert outside the contract period rejects', async () => {
    await expect(new LocalDataService({ demoUserId: 1 }).upsertEntry({ contractId: 1, date: '2027-03-01', type: 'OnSiteFull' })).rejects.toThrow(/outside/i);
  });
  test('upsert assigns a numeric id', async () => {
    const saved = await new LocalDataService({ demoUserId: 1 }).upsertEntry({ contractId: 1, date: '2026-11-03', type: 'OnSiteFull' });
    expect(typeof saved.id).toBe('number');
  });
  test('deleteEntry removes and is a no-op when nothing matches', async () => {
    const svc = new LocalDataService({ demoUserId: 1 });
    await svc.upsertEntry({ contractId: 1, date: '2026-11-03', type: 'OnSiteFull' });
    await svc.deleteEntry(1, '2026-11-03');
    await svc.deleteEntry(1, '2026-11-03');
    expect(await svc.getEntries(1, '2026-11-03', '2026-11-03')).toEqual([]);
  });
  test('instances do not share state', async () => {
    const a = new LocalDataService({ demoUserId: 1 });
    await a.upsertEntry({ contractId: 1, date: '2026-11-03', type: 'OnSiteFull' });
    expect(await new LocalDataService({ demoUserId: 1 }).getEntries(1, '2026-11-03', '2026-11-03')).toEqual([]);
  });
  test('getHolidays merges country and *', async () => {
    const h = await new LocalDataService({ demoUserId: 1 }).getHolidays('DE', '2026-12-01', '2027-01-31');
    expect(h.map(x => x.date)).toEqual(['2027-01-01']);
  });
  test('getCurrentUser derives roles', async () => {
    expect((await new LocalDataService({ demoUserId: 1 }).getCurrentUser()).roles).toEqual(['Contractor']);
    expect((await new LocalDataService({ demoUserId: 3 }).getCurrentUser()).roles).toEqual(['ContractManager']);
    expect((await new LocalDataService({ demoUserId: 4 }).getCurrentUser()).roles).toContain('Admin');
  });
});
