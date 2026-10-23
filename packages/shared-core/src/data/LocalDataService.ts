import { CalendarEntry, Contract, DateKey, Holiday, Role, UserInfo, UserRef } from '../models';
import { compareKeys, isWithin } from '../dates';
import { assertCanWriteDays, assertNotClosedSibling, hasContractPeriod, holidayApplies, isBlocked } from '../rules';
import { IDataService } from './IDataService';
import usersJson from './fixtures/users.json';
import contractsJson from './fixtures/contracts.json';
import entriesJson from './fixtures/entries.json';
import holidaysJson from './fixtures/holidays.json';

export interface LocalDataServiceOptions {
  demoUserId: number;
  /** Weekends are blocked for writes. Defaults to true; holidays are always blocked. */
  blockWeekends?: boolean;
}

const ADMIN_USER_ID = 4;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export class LocalDataService implements IDataService {
  public static readonly demoUsers: UserRef[] = clone(usersJson) as UserRef[];

  private readonly userId: number;
  private readonly blockWeekends: boolean;
  private readonly contracts: Contract[] = clone(contractsJson) as Contract[];
  private entries: CalendarEntry[] = clone(entriesJson) as CalendarEntry[];
  private readonly holidays: Holiday[] = clone(holidaysJson) as Holiday[];
  private nextId: number;

  constructor(opts: LocalDataServiceOptions) {
    this.userId = opts.demoUserId;
    this.blockWeekends = opts.blockWeekends ?? true;
    this.nextId = this.entries.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  }

  public async getCurrentUser(): Promise<UserInfo> {
    const user = LocalDataService.demoUsers.find(u => u.id === this.userId);
    if (!user) { throw new Error(`Unknown demo user ${this.userId}`); }
    const roles: Role[] = [];
    if (this.contracts.some(c => c.contractor.id === this.userId)) { roles.push('Contractor'); }
    if (this.contracts.some(c => c.contractManager.id === this.userId)) { roles.push('ContractManager'); }
    if (this.userId === ADMIN_USER_ID) { roles.push('Admin'); }
    return { ...user, roles };
  }

  public async getMyContracts(): Promise<Contract[]> {
    const admin = this.userId === ADMIN_USER_ID;
    return clone(this.contracts
      .filter(c => c.status !== 'Closed')
      .filter(hasContractPeriod)
      .filter(c => admin || c.contractor.id === this.userId || c.contractManager.id === this.userId)
      .sort((a, b) => compareKeys(a.startDate, b.startDate)));
  }

  public async getEntries(contractId: number, from: DateKey, to: DateKey): Promise<CalendarEntry[]> {
    return clone(this.entries
      .filter(x => x.contractId === contractId && isWithin(x.date, from, to))
      .sort((a, b) => compareKeys(a.date, b.date)));
  }

  public async upsertEntry(entry: CalendarEntry): Promise<CalendarEntry> {
    const contract = this.contracts.find(c => c.id === entry.contractId);
    if (!contract) { throw new Error(`Unknown contract ${entry.contractId}`); }
    assertCanWriteDays(contract, this.userId);
    if (isBlocked(entry.date, this.holidays, contract.country, this.blockWeekends)) {
      throw new Error(`Date ${entry.date} is blocked (weekend or holiday)`);
    }
    if (!isWithin(entry.date, contract.startDate, contract.latestExecutionDate)) {
      throw new Error(`Date ${entry.date} is outside the contract period ${contract.startDate}..${contract.latestExecutionDate}`);
    }
    const siblings = new Set(this.contracts.filter(c => c.contractor.id === contract.contractor.id).map(c => c.id));
    this.entries
      .filter(x => x.date === entry.date && siblings.has(x.contractId) && x.contractId !== contract.id)
      .forEach(x => assertNotClosedSibling(this.contracts.find(c => c.id === x.contractId) as Contract));
    this.entries = this.entries.filter(x => !(x.date === entry.date && siblings.has(x.contractId)));
    const saved: CalendarEntry = { ...entry, id: this.nextId++ };
    this.entries.push(saved);
    return clone(saved);
  }

  public async deleteEntry(contractId: number, date: DateKey): Promise<void> {
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) { throw new Error(`Unknown contract ${contractId}`); }
    assertCanWriteDays(contract, this.userId);
    this.entries = this.entries.filter(x => !(x.contractId === contractId && x.date === date));
  }

  public async getHolidays(country: string, from: DateKey, to: DateKey): Promise<Holiday[]> {
    return clone(this.holidays
      .filter(h => holidayApplies(h.country, country) && isWithin(h.date, from, to))
      .sort((a, b) => compareKeys(a.date, b.date)));
  }
}
