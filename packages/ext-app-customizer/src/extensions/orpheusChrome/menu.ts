import { DEFAULT_CALENDAR_PAGE_URL, resolveWebLink } from '@orpheussystems/shared-core/links';
import type { Role } from '@orpheussystems/shared-core';
import { orpheusBrand } from '@orpheussystems/shared-ui/brand';
import type { IOrpheusChromeProperties, MenuItem } from './IOrpheusChromeProperties';

export type { IOrpheusChromeProperties, MenuItem } from './IOrpheusChromeProperties';

const DEFAULT_CONTRACTS_LIST_URL = 'Lists/Contracts';

export const DEFAULT_MENU: MenuItem[] = [
  { label: 'My calendar', url: '{calendarPageUrl}' },
  { label: 'Contracts', url: '{contractsListUrl}', roles: ['ContractManager', 'Admin'] },
  { label: 'Holidays', url: 'Lists/Holidays', roles: ['Admin'] }
];

/** Same rule as the form's calendar link (shared resolveWebLink); anything not http(s) falls back to the web. */
function toAbsolute(url: string, webUrl: string): string {
  return resolveWebLink(webUrl, url) || webUrl;
}

/** Fills {calendarPageUrl}/{contractsListUrl} tokens and makes every URL absolute against the web. */
export function resolveMenu(props: IOrpheusChromeProperties, webUrl: string): MenuItem[] {
  const tokens: Record<string, string> = {
    '{calendarPageUrl}': props.calendarPageUrl || DEFAULT_CALENDAR_PAGE_URL,
    '{contractsListUrl}': props.contractsListUrl || DEFAULT_CONTRACTS_LIST_URL
  };
  const source = props.menu && props.menu.length > 0 ? props.menu : DEFAULT_MENU;
  return source.map(item => {
    const filled = tokens[item.url] !== undefined ? tokens[item.url] : item.url;
    return { ...item, url: toAbsolute(filled, webUrl) };
  });
}

/** Role-less items are visible to everyone, including users whose role lookup failed (roles = []). */
export function visibleMenuItems(items: MenuItem[], roles: Role[]): MenuItem[] {
  return items.filter(i => !i.roles || i.roles.length === 0 || i.roles.some(r => roles.indexOf(r) !== -1));
}

export function footerText(version: string): { kicker: string; contact: string; version: string } {
  return { kicker: orpheusBrand.kicker, contact: orpheusBrand.contactEmail, version: `v${version}` };
}
