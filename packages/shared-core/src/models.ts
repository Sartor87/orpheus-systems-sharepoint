export type EntryType = 'OnSiteFull' | 'OnSiteHalf' | 'OffSiteFull' | 'OffSiteHalf';
export type Modality = 'On-site' | 'Off-site' | 'Hybrid';
export type ContractStatus = 'Draft' | 'Active' | 'Closed';
export type DateKey = string; // yyyy-MM-dd
export type Role = 'Contractor' | 'ContractManager' | 'Admin';

export interface UserRef {
  id: number;
  loginName: string;
  displayName: string;
  email: string;
}

export interface Contract {
  id: number;
  title: string;
  contractCode: string;
  frameworkContract: string;
  modality: Modality;
  contractor: UserRef;
  contractManager: UserRef;
  startDate: DateKey;
  latestExecutionDate: DateKey;
  onSiteTargetDays: number;
  offSiteTargetDays: number;
  hoursPerDay: number;
  country: string;
  status: ContractStatus;
}

export interface CalendarEntry {
  id?: number;
  contractId: number;
  date: DateKey;
  type: EntryType;
  note?: string;
}

export interface Holiday {
  id?: number;
  title: string;
  date: DateKey;
  country: string;
  source: 'Manual' | 'Agent';
}

export interface UserInfo extends UserRef {
  roles: Role[];
}
