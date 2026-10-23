import { contractsFilter, entriesOfContractFilter, contractsOfContractorFilter, entriesFilter, entriesOnDateFilter, holidaysFilter, spDayEnd, spDayStart } from '../data/spQueries';
import { UserInfo } from '../models';

const user: UserInfo = { id: 7, loginName: 'jane', displayName: 'Jane Doe', email: 'jane@example.com', roles: ['Contractor'] };

describe('spQueries', () => {
  it('spDayStart/spDayEnd give the noon-to-noon day window', () => {
    expect(spDayStart('2026-11-01')).toBe("datetime'2026-10-31T12:00:00Z'");
    expect(spDayEnd('2026-11-01')).toBe("datetime'2026-11-01T12:00:00Z'");
  });

  it('spDayStart never goes below the SharePoint DateTime minimum', () => {
    expect(spDayStart('1900-01-01')).toBe("datetime'1900-01-01T00:00:00Z'");
    expect(spDayStart('1900-01-02')).toBe("datetime'1900-01-01T12:00:00Z'");
    expect(entriesFilter(5, '1900-01-01', '2999-12-31')).toContain("EntryDate ge datetime'1900-01-01T00:00:00Z'");
  });

  it('entriesOfContractFilter queries by contract only', () => {
    expect(entriesOfContractFilter(7)).toBe('ContractId eq 7');
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

  it('entriesFilter covers whole day windows', () => {
    expect(entriesFilter(5, '2026-11-01', '2026-11-30')).toBe(
      "ContractId eq 5 and EntryDate ge datetime'2026-10-31T12:00:00Z' and EntryDate lt datetime'2026-11-30T12:00:00Z'");
  });

  it('holidaysFilter with a blank country matches only * and does not throw', () => {
    expect(holidaysFilter(null as unknown as string, '2026-01-01', '2026-12-31')).toContain("(Country eq '' or Country eq '*')");
  });

  it('holidaysFilter matches the country or *', () => {
    expect(holidaysFilter('BG', '2026-01-01', '2026-12-31')).toBe(
      "(Country eq 'BG' or Country eq '*') and HolidayDate ge datetime'2025-12-31T12:00:00Z' and HolidayDate lt datetime'2026-12-31T12:00:00Z'");
  });

  it('holidaysFilter escapes single quotes in the country', () => {
    expect(holidaysFilter("C'D", '2026-01-01', '2026-01-02')).toContain("Country eq 'C''D'");
  });

  it('entriesOnDateFilter spans sibling contracts', () => {
    expect(entriesOnDateFilter([1, 2], '2026-03-04')).toBe("(ContractId eq 1 or ContractId eq 2) and EntryDate ge datetime'2026-03-03T12:00:00Z' and EntryDate lt datetime'2026-03-04T12:00:00Z'");
  });

  it('contractsOfContractorFilter', () => {
    expect(contractsOfContractorFilter(7)).toBe('ContractorId eq 7');
  });
});
