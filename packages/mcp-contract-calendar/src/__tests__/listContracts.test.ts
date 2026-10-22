import { LocalDataService } from '@orpheussystems/shared-core';
import { InMemoryContractDirectory } from '../domain/InMemoryContractDirectory';
import { AGENT_CONTRACTS, CAST } from '../domain/__fixtures__/agentCast';
import type { ToolContext, Viewer } from '../domain/types';
import { listContracts } from '../tools/listContracts';

const ctx = (viewer: Viewer): ToolContext => ({
  viewer,
  data: new LocalDataService({ demoUserId: 1 }),
  directory: new InMemoryContractDirectory(AGENT_CONTRACTS),
  today: '2026-10-22'
});
const hr: Viewer = { user: CAST.emilia, roles: ['HR'] };

describe('listContracts', () => {
  it('HR: manager "Ivan" needs a choice when two Ivans', async () => {
    const r = await listContracts(ctx(hr), { manager: 'Ivan' });
    expect(r.status).toBe('needs_choice');
    if (r.status === 'needs_choice') {
      expect(r.candidates.map(c => c.id).sort()).toEqual([101, 106]);
      expect(r.candidates[0]).toEqual(
        expect.objectContaining({ name: expect.any(String), email: expect.any(String) })
      );
    }
  });

  it('HR: full name resolves', async () => {
    const r = await listContracts(ctx(hr), { manager: 'Ivan Draganov' });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.vendors.map(v => v.vendor)).toEqual([
        'Kuker Consulting',
        'Samodiva Systems',
        'Sofia SharePoint Chads'
      ]);
      expect(r.vendors[0].contracts).toHaveLength(2);
    }
  });

  it('HR: email and case-insensitive surname resolve', async () => {
    const a = await listContracts(ctx(hr), { manager: 'IVAN.IVANOV@example.com' });
    const b = await listContracts(ctx(hr), { manager: 'ivanov' });
    for (const r of [a, b]) {
      expect(r.status).toBe('ok');
      if (r.status === 'ok') expect(r.vendors.map(v => v.contracts.map(c => c.id))).toEqual([[2105]]);
    }
  });

  it('includeClosed adds closed contracts', async () => {
    const r = await listContracts(ctx(hr), { vendor: 'samodiva systems', includeClosed: true });
    expect(r.status === 'ok' && r.vendors[0].contracts.map(c => c.id)).toEqual([2199, 2101]);
  });

  it('manager sees own grouping', async () => {
    const v: Viewer = { user: CAST.ivanD, roles: ['ContractManager'] };
    const r = await listContracts(ctx(v), {});
    expect(r.status === 'ok' && r.vendors).toHaveLength(3);
    const x = await listContracts(ctx(v), { manager: 'Ivan Ivanov' });
    expect(x).toEqual({
      status: 'ok',
      vendors: [],
      note: 'No manager named "Ivan Ivanov" among the contracts you can see.'
    });
  });

  it('contractor is refused', async () => {
    await expect(
      listContracts(ctx({ user: CAST.alex, roles: ['Contractor'] }), {})
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
