import { CalendarEntry, Contract, DateKey, Holiday, IDataService, LocalDataService, UserInfo } from '@orpheussystems/shared-core';

/** A write held until the test settles it. */
export interface HeldWrite {
  op: 'upsert' | 'delete';
  date: DateKey;
  contractId: number;
  /** Applies the write to the in-memory store and resolves the caller's promise. */
  succeed(): void;
  fail(message?: string): void;
}

/**
 * LocalDataService wrapper whose writes (when `holdWrites` is on) and entry loads (via `failEntries` /
 * `holdEntries`) are controlled by the test, so ordering can be forced.
 */
export class ControlledService implements IDataService {
  public readonly inner: LocalDataService;
  public holdWrites: boolean = false;
  public failEntries: boolean = false;
  public readonly held: HeldWrite[] = [];
  public readonly calls = { getEntries: 0, upsertEntry: 0, deleteEntry: 0 };
  private entriesGate: Promise<void> | undefined;
  private openGate: (() => void) | undefined;

  public constructor(demoUserId: number, inner?: LocalDataService) {
    this.inner = inner || new LocalDataService({ demoUserId });
  }

  // Setters rather than field writes: tests flip these after awaits (eslint require-atomic-updates).
  public setHoldWrites(on: boolean): void { this.holdWrites = on; }
  public setFailEntries(on: boolean): void { this.failEntries = on; }

  /** Holds every getEntries call until releaseEntries(). */
  public holdEntries(): void {
    this.entriesGate = new Promise<void>(resolve => { this.openGate = resolve; });
  }

  public releaseEntries(): void {
    const open = this.openGate;
    this.entriesGate = undefined;
    this.openGate = undefined;
    if (open) { open(); }
  }

  public getCurrentUser(): Promise<UserInfo> { return this.inner.getCurrentUser(); }
  public getMyContracts(): Promise<Contract[]> { return this.inner.getMyContracts(); }
  public getHolidays(country: string, from: DateKey, to: DateKey): Promise<Holiday[]> { return this.inner.getHolidays(country, from, to); }

  public async getEntries(contractId: number, from: DateKey, to: DateKey): Promise<CalendarEntry[]> {
    this.calls.getEntries++;
    if (this.entriesGate) { await this.entriesGate; }
    if (this.failEntries) { throw new Error('Entries list unavailable'); }
    return this.inner.getEntries(contractId, from, to);
  }

  public upsertEntry(entry: CalendarEntry): Promise<CalendarEntry> {
    this.calls.upsertEntry++;
    if (!this.holdWrites) { return this.inner.upsertEntry(entry); }
    return new Promise<CalendarEntry>((resolve, reject) => {
      this.held.push({
        op: 'upsert', date: entry.date, contractId: entry.contractId,
        succeed: () => { this.inner.upsertEntry(entry).then(resolve, reject); },
        fail: (message = 'Save failed') => reject(new Error(message))
      });
    });
  }

  public deleteEntry(contractId: number, date: DateKey): Promise<void> {
    this.calls.deleteEntry++;
    if (!this.holdWrites) { return this.inner.deleteEntry(contractId, date); }
    return new Promise<void>((resolve, reject) => {
      this.held.push({
        op: 'delete', date, contractId,
        succeed: () => { this.inner.deleteEntry(contractId, date).then(resolve, reject); },
        fail: (message = 'Delete failed') => reject(new Error(message))
      });
    });
  }
}
