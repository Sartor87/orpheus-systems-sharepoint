// PnPjs is ESM-only; the service needs its side-effect imports only, so they are stubbed.
jest.mock('@pnp/sp/webs', () => ({}));
jest.mock('@pnp/sp/lists', () => ({}));
jest.mock('@pnp/sp/items', () => ({}));
jest.mock('@pnp/sp/site-users', () => ({}));
jest.mock('@pnp/sp/site-groups', () => ({}));
jest.mock('@pnp/sp/batching', () => ({}));

import type { SPFI } from '@pnp/sp';
import { SharePointDataService } from '../data/SharePointDataService';
import type { SPContractItem, SPEntryItem } from '../data/spMappers';

const base: SPContractItem = {
  Id: 1,
  Title: '002101_2026',
  ContractCode: '1185-Jane-Doe',
  FrameworkContract: 'FWC',
  Modality: 'Hybrid',
  Contractor: { Id: 7, Title: 'Jane Doe', EMail: 'jane@example.com', Name: 'jane' },
  ContractManager: { Id: 8, Title: 'Max Manager', EMail: 'max@example.com', Name: 'max' },
  StartDate: '2026-02-02T00:00:00Z',
  LatestExecutionDate: '2027-02-19T00:00:00Z',
  OnSiteTargetDays: 10,
  OffSiteTargetDays: 10,
  HoursPerDay: 8,
  Country: 'BG',
  Status: 'Active'
};

/** A contracts list whose item query (any chain of select/expand/orderBy/top/filter) resolves `rows`. */
function fakeSp(rows: SPContractItem[]): SPFI {
  const query = Object.assign(() => Promise.resolve(rows), {}) as unknown as Record<string, unknown>;
  ['select', 'expand', 'orderBy', 'top', 'filter'].forEach(m => { query[m] = () => query; });
  return { web: { lists: { getById: () => ({ items: query }) } } } as unknown as SPFI;
}

describe('SharePointDataService.getMyContracts', () => {
  it('does not reject on contracts with a null or empty date and leaves them out', async () => {
    const svc = new SharePointDataService(
      fakeSp([
        base,
        { ...base, Id: 2, StartDate: null },
        { ...base, Id: 3, LatestExecutionDate: '' }
      ]),
      { contractsListId: 'c', entriesListId: 'e', holidaysListId: 'h' },
      { id: 7, loginName: 'jane', displayName: 'Jane Doe', email: 'jane@example.com', roles: ['Contractor'] }
    );
    await expect(svc.getMyContracts()).resolves.toEqual([expect.objectContaining({ id: 1, startDate: '2026-02-02' })]);
  });
});

interface FakeLists { contracts: SPContractItem[]; entries?: SPEntryItem[] }

/**
 * Routes by list id: `c` contracts, `e` entries, `h` holidays (always empty). Item queries resolve every row of the
 * list (filters are not evaluated); `items.getById(n)` resolves the row with that id. `batched` is a spy.
 */
function routedSp(data: FakeLists): { sp: SPFI; batched: jest.Mock } {
  const query = (rows: unknown[]): Record<string, unknown> => {
    const q = Object.assign(() => Promise.resolve(rows), {}) as unknown as Record<string, unknown>;
    ['select', 'expand', 'orderBy', 'top', 'filter'].forEach(m => { q[m] = () => q; });
    return q;
  };
  const list = (id: string): unknown => {
    const rows: Array<{ Id: number }> = id === 'c' ? data.contracts : id === 'e' ? (data.entries || []) : [];
    return { items: Object.assign(query(rows), { getById: (n: number) => query(rows.filter(r => r.Id === n)[0] as unknown as unknown[]) }) };
  };
  const batched = jest.fn(() => { throw new Error('no write expected'); });
  return { sp: { web: { lists: { getById: list } }, batched } as unknown as SPFI, batched };
}

const lists = { contractsListId: 'c', entriesListId: 'e', holidaysListId: 'h' };
const jane = { id: 7, loginName: 'jane', displayName: 'Jane Doe', email: 'jane@example.com', roles: ['Contractor' as const] };
const max = { id: 8, loginName: 'max', displayName: 'Max Manager', email: 'max@example.com', roles: ['ContractManager' as const] };
const monday = '2026-03-02';

describe('SharePointDataService write guards', () => {
  it('rejects an upsert on a Closed contract without writing', async () => {
    const { sp, batched } = routedSp({ contracts: [{ ...base, Status: 'Closed' }] });
    await expect(new SharePointDataService(sp, lists, jane).upsertEntry({ contractId: 1, date: monday, type: 'OnSiteFull' }))
      .rejects.toThrow(/closed/i);
    expect(batched).not.toHaveBeenCalled();
  });

  it('rejects an upsert by someone who is not the contract\'s contractor', async () => {
    const { sp, batched } = routedSp({ contracts: [base] });
    await expect(new SharePointDataService(sp, lists, max).upsertEntry({ contractId: 1, date: monday, type: 'OnSiteFull' }))
      .rejects.toThrow(/only the contractor/i);
    expect(batched).not.toHaveBeenCalled();
  });

  it('rejects an upsert on a contract with a blank period with a clear message', async () => {
    const { sp } = routedSp({ contracts: [{ ...base, StartDate: null }] });
    await expect(new SharePointDataService(sp, lists, jane).upsertEntry({ contractId: 1, date: monday, type: 'OnSiteFull' }))
      .rejects.toThrow(/no start or end date/i);
  });

  it('rejects an upsert that would move the day off a Closed sibling contract', async () => {
    const { sp, batched } = routedSp({
      contracts: [base, { ...base, Id: 2, Title: '002100_2025', Status: 'Closed' }],
      entries: [{ Id: 50, Contract: { Id: 2 }, EntryDate: `${monday}T00:00:00Z`, EntryType: 'OnSiteFull' }]
    });
    await expect(new SharePointDataService(sp, lists, jane).upsertEntry({ contractId: 1, date: monday, type: 'OffSiteFull' }))
      .rejects.toThrow(/002100_2025.*closed/i);
    expect(batched).not.toHaveBeenCalled();
  });

  it('rejects a delete on a Closed contract or by someone else', async () => {
    const entries: SPEntryItem[] = [{ Id: 50, Contract: { Id: 1 }, EntryDate: `${monday}T00:00:00Z`, EntryType: 'OnSiteFull' }];
    const closed = routedSp({ contracts: [{ ...base, Status: 'Closed' }], entries });
    await expect(new SharePointDataService(closed.sp, lists, jane).deleteEntry(1, monday)).rejects.toThrow(/closed/i);
    const other = routedSp({ contracts: [base], entries });
    await expect(new SharePointDataService(other.sp, lists, max).deleteEntry(1, monday)).rejects.toThrow(/only the contractor/i);
    expect(closed.batched).not.toHaveBeenCalled();
    expect(other.batched).not.toHaveBeenCalled();
  });

  it('leaves out entries with an unknown EntryType instead of miscounting them', async () => {
    const { sp } = routedSp({
      contracts: [base],
      entries: [
        { Id: 50, Contract: { Id: 1 }, EntryDate: `${monday}T00:00:00Z`, EntryType: 'OnSite Full' },
        { Id: 51, Contract: { Id: 1 }, EntryDate: '2026-03-03T00:00:00Z', EntryType: 'OffSiteFull' }
      ]
    });
    await expect(new SharePointDataService(sp, lists, jane).getEntries(1, '2026-03-01', '2026-03-31'))
      .resolves.toEqual([{ id: 51, contractId: 1, date: '2026-03-03', type: 'OffSiteFull' }]);
  });

  it('ignores entries whose Contract lookup is orphaned instead of crashing', async () => {
    const { sp } = routedSp({
      contracts: [base],
      entries: [
        { Id: 50, Contract: null, EntryDate: `${monday}T00:00:00Z`, EntryType: 'OnSiteFull' },
        { Id: 51, Contract: { Id: 1 }, EntryDate: '2026-03-03T00:00:00Z', EntryType: 'OffSiteFull' }
      ]
    });
    await expect(new SharePointDataService(sp, lists, jane).getEntries(1, '2026-03-01', '2026-03-31'))
      .resolves.toEqual([{ id: 51, contractId: 1, date: '2026-03-03', type: 'OffSiteFull' }]);
  });
});

describe('SharePointDataService write serialization', () => {
  /** A batch whose execute() waits for the test; every queued sub-request resolves once it runs. */
  function heldBatches(sp: SPFI): Array<() => void> {
    const releases: Array<() => void> = [];
    const ok = (): Promise<unknown> => Promise.resolve({ Id: 99 });
    const item = { delete: ok, update: ok };
    const batchSp = { web: { lists: { getById: () => ({ items: { getById: () => item, add: ok } }) } } };
    (sp as unknown as { batched: jest.Mock }).batched = jest.fn(() => [
      batchSp,
      () => new Promise<void>(resolve => { releases.push(resolve); })
    ]);
    return releases;
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 30; i++) { await Promise.resolve(); }
  }

  it('runs writes one at a time, so each recompute of used days sees the previous write', async () => {
    const { sp } = routedSp({ contracts: [base] });
    const releases = heldBatches(sp);
    const svc = new SharePointDataService(sp, lists, jane);
    const batched = (sp as unknown as { batched: jest.Mock }).batched;

    const first = svc.upsertEntry({ contractId: 1, date: '2026-03-02', type: 'OnSiteFull' });
    const second = svc.upsertEntry({ contractId: 1, date: '2026-03-03', type: 'OnSiteFull' });
    await settle();
    expect(batched).toHaveBeenCalledTimes(1);                   // the second waits for the first batch
    releases[0]();
    await first;
    await settle();
    expect(batched).toHaveBeenCalledTimes(2);
    releases[1]();
    await expect(second).resolves.toMatchObject({ date: '2026-03-03' });
  });

  it('goes on after a failed write', async () => {
    const { sp } = routedSp({ contracts: [{ ...base, Status: 'Closed' }, { ...base, Id: 2 }] });
    const releases = heldBatches(sp);
    const svc = new SharePointDataService(sp, lists, jane);
    const failed = svc.upsertEntry({ contractId: 1, date: '2026-03-02', type: 'OnSiteFull' });
    const next = svc.upsertEntry({ contractId: 2, date: '2026-03-03', type: 'OnSiteFull' });
    await expect(failed).rejects.toThrow(/closed/i);
    await settle();
    releases[0]();
    await expect(next).resolves.toMatchObject({ contractId: 2 });
  });
});
