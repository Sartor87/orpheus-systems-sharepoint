import { CalendarEntry, Contract, DateKey, Holiday, UserInfo } from '../models';

export interface IDataService {
  getCurrentUser(): Promise<UserInfo>;
  /** Filtered by role; Closed contracts and contracts with a blank start or end date excluded; ordered by startDate ascending. */
  getMyContracts(): Promise<Contract[]>;
  getEntries(contractId: number, from: DateKey, to: DateKey): Promise<CalendarEntry[]>;
  /** Enforces one entry per contractor per date; moves it from a sibling contract. */
  upsertEntry(entry: CalendarEntry): Promise<CalendarEntry>;
  deleteEntry(contractId: number, date: DateKey): Promise<void>;
  /** Holidays of the given country plus '*', sorted by date. */
  getHolidays(country: string, from: DateKey, to: DateKey): Promise<Holiday[]>;
}
