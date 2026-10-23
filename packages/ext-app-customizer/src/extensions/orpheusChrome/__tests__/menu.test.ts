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

test('resolveMenu reads URLs like the form does: web-relative, server-relative (leading slash) or absolute', () => {
  const items = resolveMenu({ menu: [
    { label: 'A', url: 'Lists/X' },
    { label: 'B', url: '/sites/s/Lists/Y' },
    { label: 'C', url: 'https://other/x' }
  ] }, 'https://t/sites/s/');
  expect(items.map(i => i.url)).toEqual(['https://t/sites/s/Lists/X', 'https://t/sites/s/Lists/Y', 'https://other/x']);
});

test('a server-relative calendarPageUrl is not doubled under the web path', () => {
  expect(resolveMenu({ calendarPageUrl: '/sites/s/SitePages/Cal.aspx' }, 'https://t/sites/s')[0].url)
    .toBe('https://t/sites/s/SitePages/Cal.aspx');
});

test('a menu URL that is not http(s) never becomes a link target', () => {
  // eslint-disable-next-line no-script-url -- the point of the test
  const [item] = resolveMenu({ menu: [{ label: 'X', url: 'javascript:alert(1)' }] }, 'https://t/sites/s');
  expect(item.url).toBe('https://t/sites/s');
});

test('footer uses brand kicker and contact', () => {
  expect(footerText('1.0.0')).toEqual({ kicker: 'SOFTWARE ARCHITECTURE CONSULTANCY · SOFIA, BULGARIA · EU', contact: 'kiril.iliev@orpheussystems.com', version: 'v1.0.0' });
});
