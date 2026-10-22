declare interface IContractCalendarWebPartStrings {
  PropertyPaneDescription: string;
  DataGroupName: string;
  DisplayGroupName: string;
  TimesheetGroupName: string;
  UseLocalDataLabel: string;
  DemoUserLabel: string;
  ContractsListLabel: string;
  EntriesListLabel: string;
  HolidaysListLabel: string;
  MonthsToShowLabel: string;
  BlockWeekendsLabel: string;
  ApprovingOrgLabel: string;
  ServiceProviderLabel: string;
  ServiceUnavailable: string;
}

declare module 'ContractCalendarWebPartStrings' {
  const strings: IContractCalendarWebPartStrings;
  export = strings;
}
