import { resolveMenu, visibleMenuItems, footerText } from '../menu';

test('everyone sees role-less items; managers also see Contracts', () => {
  const items = resolveMenu({}, 'https://t/sites/s');
  expect(visibleMenuItems(items, ['Contractor']).map(i => i.label)).toEqual(['My calendar']);
  expect(visibleMenuItems(items, ['ContractManager']).map(i => i.label)).toEqual(['My calendar', 'Contracts']);
  expect(visibleMenuItems(items, ['Admin']).map(i => i.label)).toEqual(['My calendar', 'Contracts', 'Holidays']);
  expect(visibleMenuItems(items, []).map(i => i.label)).toEqual(['My calendar']);
});

test('resolveMenu fills tokens into absolute URLs', () => {
  expect(resolveMenu({ calendarPageUrl: 'SitePages/Cal.aspx' }, 'https://t/sites/s')[0].url).toBe('https://t/sites/s/SitePages/Cal.aspx');
});

test('resolveMenu tolerates trailing/leading slashes and keeps absolute URLs', () => {
  const items = resolveMenu({ menu: [{ label: 'A', url: '/Lists/X' }, { label: 'B', url: 'https://other/x' }] }, 'https://t/sites/s/');
  expect(items.map(i => i.url)).toEqual(['https://t/sites/s/Lists/X', 'https://other/x']);
});

test('footer uses brand kicker and contact', () => {
  expect(footerText('1.0.0')).toEqual({ kicker: 'SOFTWARE ARCHITECTURE CONSULTANCY · SOFIA, BULGARIA · EU', contact: 'kiril.iliev@orpheussystems.com', version: 'v1.0.0' });
});
