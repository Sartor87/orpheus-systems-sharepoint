import type { Contract, DateKey, IDataService, Role, UserRef } from '@orpheussystems/shared-core';

export type AgentRole = Role | 'HR';

export interface Viewer {
  user: UserRef;
  roles: AgentRole[];
}

export interface VendorContract extends Contract {
  vendor: string | null;
  onSiteUsedDays: number;
  offSiteUsedDays: number;
}

export interface ContractQuery {
  vendor?: string;
  managerId?: number;
  includeClosed?: boolean;
}

export interface IContractDirectory {
  listVisible(viewer: Viewer, q: ContractQuery): Promise<VendorContract[]>;
  managersVisibleTo(viewer: Viewer): Promise<UserRef[]>;
}

export interface ToolContext {
  viewer: Viewer;
  data: IDataService;
  directory: IContractDirectory;
  today: DateKey;
}
