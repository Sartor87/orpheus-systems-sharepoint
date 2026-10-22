// PnPjs is ESM-only; the service needs its side-effect imports only, so they are stubbed.
jest.mock('@pnp/sp/webs', () => ({}));
jest.mock('@pnp/sp/lists', () => ({}));
jest.mock('@pnp/sp/items', () => ({}));
jest.mock('@pnp/sp/site-users', () => ({}));
jest.mock('@pnp/sp/site-groups', () => ({}));
jest.mock('@pnp/sp/batching', () => ({}));

import type { SPFI } from '@pnp/sp';
import { SharePointDataService } from '../data/SharePointDataService';
import type { SPContractItem } from '../data/spMappers';

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
