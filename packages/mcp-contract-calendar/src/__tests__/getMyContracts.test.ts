import { LocalDataService } from '@orpheussystems/shared-core';
import { InMemoryContractDirectory } from '../domain/InMemoryContractDirectory';
import { AGENT_CONTRACTS, CAST } from '../domain/__fixtures__/agentCast';
import type { ToolContext, Viewer } from '../domain/types';
import { getMyContracts } from '../tools/getMyContracts';

const ctx = (viewer: Viewer): ToolContext => ({
  viewer,
  data: new LocalDataService({ demoUserId: 1 }),
  directory: new InMemoryContractDirectory(AGENT_CONTRACTS),
  today: '2026-10-22'
});

describe('getMyContracts', () => {
  it('returns the contractor own open contracts', async () => {
    const r = await getMyContracts(ctx({ user: CAST.alex, roles: ['Contractor'] }));
    expect(r.contracts.map(c => c.id)).toEqual([2102, 2103]);
    expect(r.roles).toEqual(['Contractor']);
    expect(r.today).toBe('2026-10-22');
    expect(r.note).toBeUndefined();
  });

  it('remaining is target minus used', async () => {
    const r = await getMyContracts(ctx({ user: CAST.alex, roles: ['Contractor'] }));
    const c = r.contracts[0];
    expect(c.contractor).toBe('Alex Stoyanov');
    expect(c.manager).toBe('Ivan Draganov');
    expect(c.onSiteRemaining).toBe(100);
    expect(c.offSiteRemaining).toBe(52);
  });

  it('no roles gives empty list and a note', async () => {
    const r = await getMyContracts(ctx({ user: CAST.alex, roles: [] }));
    expect(r.contracts).toEqual([]);
    expect(r.note).toBe('You have no contracts or read access in the contract calendar.');
  });
});
