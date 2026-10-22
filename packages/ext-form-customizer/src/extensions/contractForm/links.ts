export const DEFAULT_CALENDAR_PAGE_URL = 'SitePages/ContractCalendar.aspx';

function resolve(webUrl: string, pageUrl: string): URL | undefined {
  try {
    const url = new URL(pageUrl, webUrl.replace(/\/?$/, '/'));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Calendar page with the contract preselected. `pageUrl` is web-relative, server-relative or absolute
 * (component property); anything that does not resolve to http(s) falls back to the default page.
 */
export function calendarLink(webUrl: string, pageUrl: string, contractId: number): string {
  const url = (pageUrl && resolve(webUrl, pageUrl)) || (resolve(webUrl, DEFAULT_CALENDAR_PAGE_URL) as URL);
  url.searchParams.set('contractId', String(contractId));
  return url.toString();
}
