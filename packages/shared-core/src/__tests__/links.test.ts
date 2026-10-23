import { DEFAULT_CALENDAR_PAGE_URL, resolveWebLink } from '../links';

describe('resolveWebLink', () => {
  const web = 'https://contoso.example/sites/s';

  it('resolves web-relative, server-relative and absolute URLs the same way for every component', () => {
    expect(resolveWebLink(web, 'SitePages/Cal.aspx')).toBe('https://contoso.example/sites/s/SitePages/Cal.aspx');
    expect(resolveWebLink(web + '/', 'SitePages/Cal.aspx')).toBe('https://contoso.example/sites/s/SitePages/Cal.aspx');
    expect(resolveWebLink(web, '/sites/s/SitePages/Cal.aspx')).toBe('https://contoso.example/sites/s/SitePages/Cal.aspx');
    expect(resolveWebLink(web, 'https://other.example/x')).toBe('https://other.example/x');
  });

  it('refuses anything that is not http(s)', () => {
    // eslint-disable-next-line no-script-url -- the point of the test
    expect(resolveWebLink(web, 'javascript:alert(1)')).toBeUndefined();
    expect(resolveWebLink(web, '')).toBeUndefined();
    expect(resolveWebLink('not a url', 'x')).toBeUndefined();
  });

  it('names the default calendar page', () => {
    expect(DEFAULT_CALENDAR_PAGE_URL).toBe('SitePages/ContractCalendar.aspx');
  });
});
