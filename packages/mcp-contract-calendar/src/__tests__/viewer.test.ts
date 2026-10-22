import { canBook, seesAll, isVisible, Viewer } from '../domain/viewer';
import { CAST, AGENT_CONTRACTS } from '../domain/__fixtures__/agentCast';

const v = (user: Viewer['user'], roles: Viewer['roles']): Viewer => ({ user, roles });

describe('viewer', () => {
  it('canBook only for Contractor', () => {
    expect(canBook(v(CAST.ivanD, ['ContractManager']))).toBe(false);
    expect(canBook(v(CAST.alex, ['Contractor']))).toBe(true);
  });
  it('seesAll for HR and Admin', () => {
    expect(seesAll(v(CAST.emilia, ['HR']))).toBe(true);
    expect(seesAll(v(CAST.emilia, ['Admin']))).toBe(true);
    expect(seesAll(v(CAST.ivanD, ['ContractManager']))).toBe(false);
  });
  it('isVisible: own manager contract yes, other manager no', () => {
    const c = AGENT_CONTRACTS.find(x => x.title === '002105_2026')!;
    expect(isVisible(v(CAST.ivanI, ['ContractManager']), c)).toBe(true);
    expect(isVisible(v(CAST.ivanD, ['ContractManager']), c)).toBe(false);
  });
});
