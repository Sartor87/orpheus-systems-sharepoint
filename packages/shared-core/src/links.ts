export const DEFAULT_CALENDAR_PAGE_URL = 'SitePages/ContractCalendar.aspx';

/**
 * Resolves a configured URL against the web URL, the same way for every component: web-relative
 * ('SitePages/x.aspx'), server-relative ('/sites/s/SitePages/x.aspx') or absolute. Anything that is not http(s)
 * after resolving (e.g. a script URL) or cannot be parsed gives undefined.
 */
export function resolveWebLink(webUrl: string, url: string): string | undefined {
  if (!url || !url.trim()) { return undefined; }
  try {
    const resolved = new URL(url.trim(), webUrl.replace(/\/?$/, '/'));
    return resolved.protocol === 'https:' || resolved.protocol === 'http:' ? resolved.toString() : undefined;
  } catch {
    return undefined;
  }
}
