import { contractsFilter, contractsOfContractorFilter, entriesFilter, entriesOnDateFilter, holidaysFilter, spDate } from '../data/spQueries';
import { UserInfo } from '../models';

const user: UserInfo = { id: 7, loginName: 'jane', displayName: 'Jane Doe', email: 'jane@example.com', roles: ['Contractor'] };

describe('spQueries', () => {
  it('formats dates as datetime literals', () => {
    expect(spDate('2026-11-01')).toBe("datetime'2026-11-01T00:00:00Z'");
  });

  it('contractsFilter excludes closed contracts', () => {
    expect(contractsFilter(user, false)).toBe("(ContractorId eq 7 or ContractManagerId eq 7) and Status ne 'Closed'");
  });

  it('contractsFilter can include closed contracts', () => {
    expect(contractsFilter(user, true)).toBe('(ContractorId eq 7 or ContractManagerId eq 7)');
  });

  it('contractsFilter does not restrict by person for admins', () => {
    expect(contractsFilter({ ...user, roles: ['Admin'] }, false)).toBe("Status ne 'Closed'");
    expect(contractsFilter({ ...user, roles: ['Admin'] }, true)).toBe('');
  });

  it('entriesFilter uses inclusive bounds', () => {
    expect(entriesFilter(5, '2026-11-01', '2026-11-30')).toBe(
      "ContractId eq 5 and EntryDate ge datetime'2026-11-01T00:00:00Z' and EntryDate le datetime'2026-11-30T00:00:00Z'");
  });

  it('holidaysFilter matches the country or *', () => {
    expect(holidaysFilter('BG', '2026-01-01', '2026-12-31')).toBe(
      "(Country eq 'BG' or Country eq '*') and HolidayDate ge datetime'2026-01-01T00:00:00Z' and HolidayDate le datetime'2026-12-31T00:00:00Z'");
  });

  it('holidaysFilter escapes single quotes in the country', () => {
    expect(holidaysFilter("C'D", '2026-01-01', '2026-01-02')).toContain("Country eq 'C''D'");
  });

  it('entriesOnDateFilter spans sibling contracts', () => {
    expect(entriesOnDateFilter([1, 2], '2026-03-04')).toBe("(ContractId eq 1 or ContractId eq 2) and EntryDate ge datetime'2026-03-04T00:00:00Z' and EntryDate lt datetime'2026-03-05T00:00:00Z'");
  });

  it('contractsOfContractorFilter', () => {
    expect(contractsOfContractorFilter(7)).toBe('ContractorId eq 7');
  });
});
