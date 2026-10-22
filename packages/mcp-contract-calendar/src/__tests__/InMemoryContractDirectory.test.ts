import { InMemoryContractDirectory } from '../domain/InMemoryContractDirectory';
import { CAST, AGENT_CONTRACTS } from '../domain/__fixtures__/agentCast';

const dir = () => new InMemoryContractDirectory(AGENT_CONTRACTS);

describe('InMemoryContractDirectory', () => {
  it('manager sees only own contracts', async () => {
    expect(await dir().listVisible({ user: CAST.ivanD, roles: ['ContractManager'] }, {})).toHaveLength(4);
    expect(await dir().listVisible({ user: CAST.ivanI, roles: ['ContractManager'] }, {})).toHaveLength(1);
    expect(await dir().listVisible({ user: CAST.ivanD, roles: [] }, {})).toEqual([]);
  });
  it('HR sees all, Closed only on request', async () => {
    const hr = { user: CAST.emilia, roles: ['HR' as const] };
    expect(await dir().listVisible(hr, {})).toHaveLength(5);
    expect(await dir().listVisible(hr, { includeClosed: true })).toHaveLength(6);
  });
  it('vendor filter is case-insensitive', async () => {
    const hr = { user: CAST.emilia, roles: ['HR' as const] };
    const r = await dir().listVisible(hr, { vendor: 'kuker consulting', managerId: CAST.ivanD.id });
    expect(r.map(c => c.title)).toEqual(['002102_2026', '002103_2027']);
  });
  it('orders by vendor then startDate', async () => {
    const hr = { user: CAST.emilia, roles: ['HR' as const] };
    const r = await dir().listVisible(hr, {});
    expect(r.map(c => c.title)).toEqual(['002102_2026', '002105_2026', '002103_2027', '002101_2026', '002104_2026']);
  });
  it('contractor sees own', async () => {
    expect(await dir().listVisible({ user: CAST.alex, roles: ['Contractor'] }, {})).toHaveLength(2);
  });
  it('managersVisibleTo', async () => {
    const hr = await dir().managersVisibleTo({ user: CAST.emilia, roles: ['HR'] });
    expect(hr.map(u => u.id).sort()).toEqual([101, 106]);
    const alex = await dir().managersVisibleTo({ user: CAST.alex, roles: ['Contractor'] });
    expect(alex).toEqual([CAST.ivanD]);
  });
});
