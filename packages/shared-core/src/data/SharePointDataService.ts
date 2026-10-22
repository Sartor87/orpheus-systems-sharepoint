import { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users';
import '@pnp/sp/site-groups';
import '@pnp/sp/batching';
import { CalendarEntry, Contract, DateKey, Holiday, Role, UserInfo } from '../models';
import { compareKeys, isWithin } from '../dates';
import { computeTotals, isBlocked } from '../rules';
import { IDataService } from './IDataService';
import {
  CONTRACT_EXPAND, CONTRACT_SELECT, ENTRY_EXPAND, ENTRY_SELECT, HOLIDAY_SELECT,
  mapContract, mapEntry, mapHoliday, SPContractItem, SPEntryItem, SPHolidayItem, toEntryItem
} from './spMappers';
import {
  contractsFilter, contractsOfContractorFilter, entriesFilter, entriesOnDateFilter, holidaysFilter
} from './spQueries';

export interface SharePointListConfig {
  contractsListId: string;
  entriesListId: string;
  holidaysListId: string;
}

const FAR_PAST: DateKey = '1900-01-01';
const FAR_FUTURE: DateKey = '2999-12-31';

/** Derives the roles of a user. Call once at start-up and pass the result in as `currentUser.roles`. */
export async function deriveRoles(sp: SPFI, lists: SharePointListConfig, userId: number): Promise<Role[]> {
  const contracts = sp.web.lists.getById(lists.contractsListId).items;
  const roles: Role[] = [];
  const asContractor = await contracts.filter(`ContractorId eq ${userId}`).select('Id').top(1)();
  if (asContractor.length > 0) { roles.push('Contractor'); }
  const asManager = await contracts.filter(`ContractManagerId eq ${userId}`).select('Id').top(1)();
  if (asManager.length > 0) { roles.push('ContractManager'); }
  const owners = await sp.web.associatedOwnerGroup.users.select('Id')();
  if (owners.some((u: { Id: number }) => u.Id === userId)) { roles.push('Admin'); }
  return roles;
}

export class SharePointDataService implements IDataService {
  constructor(
    private readonly sp: SPFI,
    private readonly lists: SharePointListConfig,
    private readonly currentUser: UserInfo
  ) {}

  public async getCurrentUser(): Promise<UserInfo> {
    return this.currentUser;
  }

  public async getMyContracts(): Promise<Contract[]> {
    const filter = contractsFilter(this.currentUser, false);
    let query = this.contractsList().items.select(...CONTRACT_SELECT).expand(...CONTRACT_EXPAND).orderBy('StartDate', true).top(5000);
    if (filter) { query = query.filter(filter); }
    const items = (await query()) as SPContractItem[];
    return items.map(mapContract);
  }

  public async getEntries(contractId: number, from: DateKey, to: DateKey): Promise<CalendarEntry[]> {
    const items = (await this.entriesList().items
      .filter(entriesFilter(contractId, from, to))
      .select(...ENTRY_SELECT).expand(...ENTRY_EXPAND).orderBy('EntryDate', true).top(5000)()) as SPEntryItem[];
    return items.map(mapEntry);
  }

  public async getHolidays(country: string, from: DateKey, to: DateKey): Promise<Holiday[]> {
    const items = (await this.holidaysList().items
      .filter(holidaysFilter(country, from, to))
      .select(...HOLIDAY_SELECT).orderBy('HolidayDate', true).top(5000)()) as SPHolidayItem[];
    return items.map(mapHoliday).sort((a, b) => compareKeys(a.date, b.date));
  }

  public async upsertEntry(entry: CalendarEntry): Promise<CalendarEntry> {
    const contract = await this.loadContract(entry.contractId);
    const holidays = await this.getHolidays(contract.country, entry.date, entry.date);
    if (isBlocked(entry.date, holidays, contract.country, true)) {
      throw new Error(`Date ${entry.date} is blocked (weekend or holiday)`);
    }
    if (!isWithin(entry.date, contract.startDate, contract.latestExecutionDate)) {
      throw new Error(`Date ${entry.date} is outside the contract period ${contract.startDate}..${contract.latestExecutionDate}`);
    }

    const siblingIds = await this.siblingContractIds(contract);
    const existing = await this.entriesOnDate(siblingIds, entry.date);

    // Final entry sets of every affected contract, computed in memory so all writes go out as one batch.
    const affectedIds = new Set<number>([contract.id]);
    existing.forEach(x => affectedIds.add(x.contractId));
    const finalEntries = new Map<number, CalendarEntry[]>();
    for (const id of Array.from(affectedIds)) {
      const kept = (await this.allEntries(id)).filter(x => x.date !== entry.date);
      if (id === contract.id) { kept.push(entry); }
      finalEntries.set(id, kept);
    }

    const [batched, execute] = this.sp.batched();
    const entries = batched.web.lists.getById(this.lists.entriesListId);
    for (const old of existing) { entries.items.getById(old.id as number).delete(); }
    const added = entries.items.add(toEntryItem(entry, contract.contractCode));
    this.queueTotalsUpdates(batched, finalEntries);
    await execute();
    const result = await added;
    return { ...entry, id: result.Id };
  }

  public async deleteEntry(contractId: number, date: DateKey): Promise<void> {
    const existing = await this.entriesOnDate([contractId], date);
    if (existing.length === 0) { return; }
    const finalEntries = new Map<number, CalendarEntry[]>();
    finalEntries.set(contractId, (await this.allEntries(contractId)).filter(x => x.date !== date));

    const [batched, execute] = this.sp.batched();
    const entries = batched.web.lists.getById(this.lists.entriesListId);
    for (const old of existing) { entries.items.getById(old.id as number).delete(); }
    this.queueTotalsUpdates(batched, finalEntries);
    await execute();
  }

  private queueTotalsUpdates(batched: SPFI, finalEntries: Map<number, CalendarEntry[]>): void {
    const contracts = batched.web.lists.getById(this.lists.contractsListId);
    finalEntries.forEach((list, contractId) => {
      const totals = computeTotals(list);
      contracts.items.getById(contractId).update({ OnSiteUsedDays: totals.onSiteDays, OffSiteUsedDays: totals.offSiteDays });
    });
  }

  private contractsList() { return this.sp.web.lists.getById(this.lists.contractsListId); }
  private entriesList() { return this.sp.web.lists.getById(this.lists.entriesListId); }
  private holidaysList() { return this.sp.web.lists.getById(this.lists.holidaysListId); }

  private async loadContract(id: number): Promise<Contract> {
    const item = (await this.contractsList().items.getById(id).select(...CONTRACT_SELECT).expand(...CONTRACT_EXPAND)()) as SPContractItem;
    if (!item) { throw new Error(`Unknown contract ${id}`); }
    return mapContract(item);
  }

  private async siblingContractIds(contract: Contract): Promise<number[]> {
    const items = (await this.contractsList().items
      .filter(contractsOfContractorFilter(contract.contractor.id)).select('Id').top(5000)()) as Array<{ Id: number }>;
    const ids = items.map(i => i.Id);
    return ids.indexOf(contract.id) >= 0 ? ids : ids.concat(contract.id);
  }

  private async entriesOnDate(contractIds: number[], date: DateKey): Promise<CalendarEntry[]> {
    const items = (await this.entriesList().items
      .filter(entriesOnDateFilter(contractIds, date))
      .select(...ENTRY_SELECT).expand(...ENTRY_EXPAND).top(5000)()) as SPEntryItem[];
    return items.map(mapEntry);
  }

  private allEntries(contractId: number): Promise<CalendarEntry[]> {
    return this.getEntries(contractId, FAR_PAST, FAR_FUTURE);
  }
}
