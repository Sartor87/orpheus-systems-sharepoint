jest.mock('@pnp/sp/webs', () => ({}));
jest.mock('@pnp/sp/lists', () => ({}));
jest.mock('@pnp/sp/items', () => ({}));
jest.mock('@pnp/sp/site-groups', () => ({}));
jest.mock('@pnp/sp/site-users', () => ({}));

import type { SPFI } from '@pnp/sp';
import { deriveRolesForContracts } from '../data/listLookup';
import { CONTRACT_MANAGERS_GROUP } from '../rules';
import { normaliseWebRelativeUrl } from '../data/webUrl';
import { contractsOfContractorQuery } from '../data/spQueries';

describe('normaliseWebRelativeUrl', () => {
  it('strips web prefix and slashes', () => {
    expect(normaliseWebRelativeUrl('/sites/x/Lists/Contracts/', '/sites/x')).toBe('Lists/Contracts');
  });
  it('keeps an already relative url', () => {
    expect(normaliseWebRelativeUrl('Lists/Contracts', '/sites/x')).toBe('Lists/Contracts');
  });
  it('handles a root web', () => {
    expect(normaliseWebRelativeUrl('/Lists/Contracts', '/')).toBe('Lists/Contracts');
  });
});

describe('contractsOfContractorQuery', () => {
  it('builds the contractor filter', () => {
    expect(contractsOfContractorQuery(11)).toBe('ContractorId eq 11');
  });
});

describe('deriveRolesForContracts', () => {
  interface Fake { asContractor?: boolean; asManager?: boolean; isSiteAdmin?: boolean; groups?: Array<{ Id: number; Title: string }>; ownerGroupId?: number; me?: 'reject' | 'empty' }

  function fakeSp(f: Fake): SPFI {
    let call = 0;
    const items = {
      filter: () => ({ select: () => ({ top: () => () => Promise.resolve((call++ === 0 ? f.asContractor : f.asManager) ? [{ Id: 1 }] : []) }) })
    };
    const web = {
      lists: { getById: () => ({ items }) },
      associatedOwnerGroup: { select: () => () => Promise.resolve({ Id: f.ownerGroupId === undefined ? 3 : f.ownerGroupId }) },
      currentUser: {
        select: () => () => f.me === 'reject' ? Promise.reject(new Error('403')) : Promise.resolve(f.me === 'empty' ? {} : { IsSiteAdmin: !!f.isSiteAdmin }),
        groups: { select: () => () => Promise.resolve(f.groups || []) }
      }
    };
    return { web } as unknown as SPFI;
  }

  it('site collection admin is Admin without being in the owners group', async () => {
    await expect(deriveRolesForContracts(fakeSp({ isSiteAdmin: true }), 'c', 7)).resolves.toEqual(['Admin']);
  });

  it('member of Orpheus Contract Managers is ContractManager with no managed contract', async () => {
    const groups = [{ Id: 9, Title: CONTRACT_MANAGERS_GROUP }];
    await expect(deriveRolesForContracts(fakeSp({ groups }), 'c', 7)).resolves.toEqual(['ContractManager']);
  });

  it('contractor who is also site admin gets [Contractor, Admin]', async () => {
    await expect(deriveRolesForContracts(fakeSp({ asContractor: true, isSiteAdmin: true, groups: [{ Id: 3, Title: 'Owners' }] }), 'c', 7))
      .resolves.toEqual(['Contractor', 'Admin']);
  });

  it('manager who is also in the managers group gets ContractManager once', async () => {
    const groups = [{ Id: 9, Title: CONTRACT_MANAGERS_GROUP }];
    await expect(deriveRolesForContracts(fakeSp({ asManager: true, groups }), 'c', 7)).resolves.toEqual(['ContractManager']);
  });

  it('plain member gets no roles', async () => {
    await expect(deriveRolesForContracts(fakeSp({ groups: [{ Id: 5, Title: 'Members' }] }), 'c', 7)).resolves.toEqual([]);
  });

  it('IsSiteAdmin false and not in owners gives no Admin', async () => {
    await expect(deriveRolesForContracts(fakeSp({ isSiteAdmin: false, groups: [{ Id: 5, Title: 'Members' }] }), 'c', 7)).resolves.toEqual([]);
  });

  it('owners group member is still Admin', async () => {
    await expect(deriveRolesForContracts(fakeSp({ groups: [{ Id: 3, Title: 'Owners' }] }), 'c', 7)).resolves.toEqual(['Admin']);
  });

  it('rejects, and never grants Admin, when the IsSiteAdmin read fails', async () => {
    await expect(deriveRolesForContracts(fakeSp({ me: 'reject', groups: [{ Id: 3, Title: 'Owners' }] }), 'c', 7)).rejects.toThrow('403');
  });

  it('gives no Admin when the IsSiteAdmin field is missing', async () => {
    await expect(deriveRolesForContracts(fakeSp({ me: 'empty', groups: [{ Id: 5, Title: 'Members' }] }), 'c', 7)).resolves.toEqual([]);
  });

  it('matches the managers group title exactly (case-sensitive)', async () => {
    const groups = [{ Id: 9, Title: 'orpheus contract managers' }];
    await expect(deriveRolesForContracts(fakeSp({ groups }), 'c', 7)).resolves.toEqual([]);
  });
});
