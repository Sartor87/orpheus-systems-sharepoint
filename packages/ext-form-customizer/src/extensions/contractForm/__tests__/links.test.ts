import { calendarLink } from '../links';

describe('calendarLink', () => {
  it('builds the calendar link against the web url, keeping only http(s)', () => {
    const web = 'https://contoso.example/sites/s';
    expect(calendarLink(web, 'SitePages/ContractCalendar.aspx', 7))
      .toBe('https://contoso.example/sites/s/SitePages/ContractCalendar.aspx?contractId=7');
    expect(calendarLink(web + '/', '/sites/s/SitePages/Cal.aspx?view=m', 7))
      .toBe('https://contoso.example/sites/s/SitePages/Cal.aspx?view=m&contractId=7');
    // eslint-disable-next-line no-script-url -- the point of the test: a script URL must not become the link
    expect(calendarLink(web, 'javascript:alert(1)', 7))
      .toBe('https://contoso.example/sites/s/SitePages/ContractCalendar.aspx?contractId=7');
    expect(calendarLink(web, '', 7))
      .toBe('https://contoso.example/sites/s/SitePages/ContractCalendar.aspx?contractId=7');
  });
});
