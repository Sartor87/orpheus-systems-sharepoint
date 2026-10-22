import type { Role } from '@orpheussystems/shared-core';

export interface MenuItem {
  label: string;
  url: string;
  /** No roles = visible to everyone. */
  roles?: Role[];
}

export interface IOrpheusChromeProperties {
  /** Web-relative, default 'Lists/Contracts'. */
  contractsListUrl?: string;
  /** Web-relative, default 'SitePages/ContractCalendar.aspx'. */
  calendarPageUrl?: string;
  menu?: MenuItem[];
  /** Default true. */
  showFooter?: boolean;
}
