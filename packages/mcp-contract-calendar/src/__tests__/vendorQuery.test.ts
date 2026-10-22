import { directoryFilter, mapVendorContract, VENDOR_CONTRACT_SELECT } from '../sharepoint/vendorQuery';
import type { Viewer } from '../domain/types';

const u = (id: number) => ({ id, loginName: '', displayName: '', email: '' });
const viewer = (id: number, roles: Viewer['roles']): Viewer => ({ user: u(id), roles });

describe('directoryFilter', () => {
  it('manager only', () => {
    expect(directoryFilter(viewer(7, ['ContractManager']), {})).toBe("ContractManagerId eq 7 and Status ne 'Closed'");
  });
  it('contractor only', () => {
    expect(directoryFilter(viewer(7, ['Contractor']), {})).toBe("ContractorId eq 7 and Status ne 'Closed'");
  });
  it('both roles', () => {
    expect(directoryFilter(viewer(7, ['Contractor', 'ContractManager']), {})).toBe(
      "(ContractorId eq 7 or ContractManagerId eq 7) and Status ne 'Closed'"
    );
  });
  it('HR and Admin have no person clause', () => {
    expect(directoryFilter(viewer(1, ['HR']), {})).toBe("Status ne 'Closed'");
    expect(directoryFilter(viewer(1, ['Admin']), {})).toBe("Status ne 'Closed'");
  });
  it('includeClosed drops the status clause', () => {
    expect(directoryFilter(viewer(1, ['HR']), { includeClosed: true })).toBe('');
  });
  it('managerId adds a clause; vendor never reaches OData', () => {
    expect(directoryFilter(viewer(1, ['HR']), { managerId: 4, vendor: "O'Neil" })).toBe(
      "Status ne 'Closed' and ContractManagerId eq 4"
    );
  });
  it('no roles yields a match-nothing filter', () => {
    expect(directoryFilter(viewer(1, []), {})).toBe("Id eq 0 and Status ne 'Closed'");
  });
});

describe('mapVendorContract', () => {
  const item = {
    Id: 1, Title: 'T', ContractCode: 'C', FrameworkContract: 'F', Modality: 'Hybrid',
    Contractor: { Id: 2, Title: 'A', EMail: 'a@example.test', Name: 'a' },
    ContractManager: { Id: 3, Title: 'B', EMail: 'b@example.test', Name: 'b' },
    StartDate: '2026-01-01T00:00:00Z', LatestExecutionDate: '2026-12-31T00:00:00Z',
    OnSiteTargetDays: 10, OffSiteTargetDays: 5, HoursPerDay: 8, Country: 'DE', Status: 'Active'
  };
  it('blank vendor becomes null, null used days become 0', () => {
    const c = mapVendorContract({ ...item, Vendor: '  ', OnSiteUsedDays: null, OffSiteUsedDays: null });
    expect(c.vendor).toBeNull();
    expect(c.onSiteUsedDays).toBe(0);
    expect(c.offSiteUsedDays).toBe(0);
    expect(c.startDate).toBe('2026-01-01');
  });
  it('keeps a trimmed vendor and used days', () => {
    const c = mapVendorContract({ ...item, Vendor: ' Acme ', OnSiteUsedDays: 3, OffSiteUsedDays: 2 });
    expect(c.vendor).toBe('Acme');
    expect([c.onSiteUsedDays, c.offSiteUsedDays]).toEqual([3, 2]);
  });
  it('select includes the vendor columns', () => {
    expect(VENDOR_CONTRACT_SELECT).toEqual(expect.arrayContaining(['Vendor', 'OnSiteUsedDays', 'OffSiteUsedDays', 'Id']));
  });
});
