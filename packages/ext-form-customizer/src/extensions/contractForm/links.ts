import { DEFAULT_CALENDAR_PAGE_URL, resolveWebLink } from '@orpheussystems/shared-core/links';

export { DEFAULT_CALENDAR_PAGE_URL };

/**
 * Calendar page with the contract preselected. `pageUrl` is web-relative, server-relative or absolute
 * (component property, same rule as the header menu); anything that does not resolve to http(s) falls back to
 * the default page.
 */
export function calendarLink(webUrl: string, pageUrl: string, contractId: number): string {
  const url = new URL(resolveWebLink(webUrl, pageUrl) || (resolveWebLink(webUrl, DEFAULT_CALENDAR_PAGE_URL) as string));
  url.searchParams.set('contractId', String(contractId));
  return url.toString();
}
