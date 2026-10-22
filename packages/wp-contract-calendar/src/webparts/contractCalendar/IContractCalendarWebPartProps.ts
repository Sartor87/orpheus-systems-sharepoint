export interface IContractCalendarWebPartProps {
  useLocalData: boolean;
  demoUserId: number;
  contractsListId: string;
  entriesListId: string;
  holidaysListId: string;
  /** 0 = full contract span, capped at 12 months. */
  monthsToShow: number;
  blockWeekends: boolean;
  approvingOrgLabel: string;
  serviceProviderLabel: string;
  initialContractId?: number;
  /** Optional site- or server-relative path to an .html timesheet template; empty = built-in layout. */
  timesheetTemplateUrl?: string;
}
