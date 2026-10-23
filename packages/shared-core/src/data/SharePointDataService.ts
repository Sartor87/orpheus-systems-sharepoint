import { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users';
import '@pnp/sp/site-groups';
import '@pnp/sp/batching';
import { CalendarEntry, Contract, DateKey, Holiday, Role, UserInfo } from '../models';

type SiblingContract = Pick<Contract, 'id' | 'title' | 'status' | 'startDate' | 'latestExecutionDate'>;
import { compareKeys, isWithin } from '../dates';
import { assertCanWriteDays, assertNotClosedSibling, computeUsedTotals, hasContractPeriod, isBlocked } from '../rules';
import { IDataService } from './IDataService';
import { deriveRolesForContracts } from './listLookup';
import {
  CONTRACT_EXPAND, CONTRACT_SELECT, ENTRY_EXPAND, ENTRY_SELECT, HOLIDAY_SELECT,
  isoToDateKey, mapContract, mapEntries, mapHoliday, SPContractItem, SPEntryItem, SPHolidayItem, toEntryItem
} from './spMappers';
import {
  contractsFilter, contractsOfContractorFilter, entriesFilter, entriesOfContractFilter, entriesOnDateFilter, holidaysFilter
} from './spQueries';

export interface SharePointListConfig {
  contractsListId: string;
  entriesListId: string;
  holidaysListId: string;
}


/**
 * Derives the roles of the current user (`userId` must be the current user's id: the Admin check reads the
 * current user's own groups, which is always allowed, unlike listing the owners group members).
 * Call once at start-up and pass the result in as `currentUser.roles`.
 */
export async function deriveRoles(sp: SPFI, lists: SharePointListConfig, userId: number): Promise<Role[]> {
  return deriveRolesForContracts(sp, lists.contractsListId, userId);
}

export class SharePointDataService implements IDataService {
  /**
   * Writes run one at a time. Each write recomputes the used days of its contracts from the entries it reads
   * before its batch commits, so two writes in flight at once (a range, fast clicks) would each store a count
   * that misses the other's day. Only writes through this instance are ordered; other clients can still race.
   */
  private writeQueue: Promise<unknown> = Promise.resolve();

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
    return items.map(mapContract).filter(hasContractPeriod);
  }

  public async getEntries(contractId: number, from: DateKey, to: DateKey): Promise<CalendarEntry[]> {
    const items = (await this.entriesList().items
      .filter(entriesFilter(contractId, from, to))
      .select(...ENTRY_SELECT).expand(...ENTRY_EXPAND).orderBy('EntryDate', true).top(5000)()) as SPEntryItem[];
    return mapEntries(items);
  }

  public async getHolidays(country: string, from: DateKey, to: DateKey): Promise<Holiday[]> {
    const items = (await this.holidaysList().items
      .filter(holidaysFilter(country, from, to))
      .select(...HOLIDAY_SELECT).orderBy('HolidayDate', true).top(5000)()) as SPHolidayItem[];
    return items.map(mapHoliday).sort((a, b) => compareKeys(a.date, b.date));
  }

  public upsertEntry(entry: CalendarEntry): Promise<CalendarEntry> {
    return this.queued(() => this.doUpsert(entry));
  }

  public deleteEntry(contractId: number, date: DateKey): Promise<void> {
    return this.queued(() => this.doDelete(contractId, date));
  }

  private queued<T>(op: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(op, op);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  private async doUpsert(entry: CalendarEntry): Promise<CalendarEntry> {
    const contract = await this.loadContract(entry.contractId);
    assertCanWriteDays(contract, this.currentUser.id);
    const holidays = await this.getHolidays(contract.country, entry.date, entry.date);
    if (isBlocked(entry.date, holidays, contract.country, true)) {
      throw new Error(`Date ${entry.date} is blocked (weekend or holiday)`);
    }
    if (!isWithin(entry.date, contract.startDate, contract.latestExecutionDate)) {
      throw new Error(`Date ${entry.date} is outside the contract period ${contract.startDate}..${contract.latestExecutionDate}`);
    }

    const siblings = await this.siblingContracts(contract);
    const existing = await this.entriesOnDate(siblings.map(s => s.id), entry.date);
    existing
      .filter(x => x.contractId !== contract.id)
      .forEach(x => siblings.filter(s => s.id === x.contractId).forEach(assertNotClosedSibling));

    // Final entry sets of every affected contract, computed in memory so all writes go out as one batch.
    const affectedIds = new Set<number>([contract.id]);
    existing.forEach(x => affectedIds.add(x.contractId));
    const finalEntries = new Map<number, CalendarEntry[]>();
    const periods = new Map<number, SiblingContract>();
    for (const id of Array.from(affectedIds)) {
      const kept = (await this.allEntries(id)).filter(x => x.date !== entry.date);
      if (id === contract.id) { kept.push(entry); }
      finalEntries.set(id, kept);
      periods.set(id, id === contract.id ? contract : siblings.filter(s => s.id === id)[0]);
    }

    const [batched, execute] = this.sp.batched();
    const entries = batched.web.lists.getById(this.lists.entriesListId);
    const pending: Array<Promise<unknown>> = existing.map(old => entries.items.getById(old.id as number).delete());
    const added = entries.items.add(toEntryItem(entry, contract.contractCode));
    pending.push(added);
    pending.push(...this.queueTotalsUpdates(batched, finalEntries, periods));
    await execute();
    // execute() does not reject for individual sub-request failures; their own promises do.
    await Promise.all(pending);
    const result = await added;
    return { ...entry, id: result.Id };
  }

  private async doDelete(contractId: number, date: DateKey): Promise<void> {
    const contract = await this.loadContract(contractId);
    assertCanWriteDays(contract, this.currentUser.id);
    const existing = await this.entriesOnDate([contractId], date);
    if (existing.length === 0) { return; }
    const finalEntries = new Map<number, CalendarEntry[]>();
    const periods = new Map<number, SiblingContract>();
    finalEntries.set(contractId, (await this.allEntries(contractId)).filter(x => x.date !== date));
    periods.set(contractId, contract);

    const [batched, execute] = this.sp.batched();
    const entries = batched.web.lists.getById(this.lists.entriesListId);
    const pending: Array<Promise<unknown>> = existing.map(old => entries.items.getById(old.id as number).delete());
    pending.push(...this.queueTotalsUpdates(batched, finalEntries, periods));
    await execute();
    // execute() does not reject for individual sub-request failures; their own promises do.
    await Promise.all(pending);
  }

  private queueTotalsUpdates(batched: SPFI, finalEntries: Map<number, CalendarEntry[]>, periods: Map<number, SiblingContract>): Array<Promise<unknown>> {
    const contracts = batched.web.lists.getById(this.lists.contractsListId);
    const promises: Array<Promise<unknown>> = [];
    finalEntries.forEach((list, contractId) => {
      const totals = computeUsedTotals(periods.get(contractId) as SiblingContract, list);
      promises.push(contracts.items.getById(contractId).update({ OnSiteUsedDays: totals.onSiteDays, OffSiteUsedDays: totals.offSiteDays }));
    });
    return promises;
  }

  private contractsList() { return this.sp.web.lists.getById(this.lists.contractsListId); }
  private entriesList() { return this.sp.web.lists.getById(this.lists.entriesListId); }
  private holidaysList() { return this.sp.web.lists.getById(this.lists.holidaysListId); }

  private async loadContract(id: number): Promise<Contract> {
    const item = (await this.contractsList().items.getById(id).select(...CONTRACT_SELECT).expand(...CONTRACT_EXPAND)()) as SPContractItem;
    if (!item) { throw new Error(`Unknown contract ${id}`); }
    return mapContract(item);
  }

  /** Every contract of the same contractor (including `contract`), with what the Closed check needs. */
  private async siblingContracts(contract: Contract): Promise<SiblingContract[]> {
    const items = (await this.contractsList().items
      .filter(contractsOfContractorFilter(contract.contractor.id)).select('Id', 'Title', 'Status', 'StartDate', 'LatestExecutionDate').top(5000)()) as Array<{ Id: number; Title: string; Status: string; StartDate: string | null; LatestExecutionDate: string | null }>;
    const list: SiblingContract[] = items.map(i => ({
      id: i.Id, title: i.Title, status: i.Status as Contract['status'],
      startDate: isoToDateKey(i.StartDate), latestExecutionDate: isoToDateKey(i.LatestExecutionDate)
    }));
    return list.some(s => s.id === contract.id) ? list : list.concat({ id: contract.id, title: contract.title, status: contract.status, startDate: contract.startDate, latestExecutionDate: contract.latestExecutionDate });
  }

  private async entriesOnDate(contractIds: number[], date: DateKey): Promise<CalendarEntry[]> {
    const items = (await this.entriesList().items
      .filter(entriesOnDateFilter(contractIds, date))
      .select(...ENTRY_SELECT).expand(...ENTRY_EXPAND).top(5000)()) as SPEntryItem[];
    return mapEntries(items);
  }

  private allEntries(contractId: number): Promise<CalendarEntry[]> {
    return this.entriesList().items
      .filter(entriesOfContractFilter(contractId))
      .select(...ENTRY_SELECT).expand(...ENTRY_EXPAND).orderBy('EntryDate', true).top(5000)()
      .then(items => mapEntries(items as SPEntryItem[]));
  }
}
