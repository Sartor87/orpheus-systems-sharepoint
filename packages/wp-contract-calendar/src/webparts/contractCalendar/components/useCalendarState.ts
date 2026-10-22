import * as React from 'react';
import {
  CalendarEntry,
  compareKeys,
  computeRemaining,
  computeTotals,
  Contract,
  contractsCoveringDate,
  DateKey,
  EntryType,
  Holiday,
  isBlocked,
  isWithin,
  monthsBetween,
  Remaining,
  toDateKey,
  Totals,
  UserInfo
} from '@orpheussystems/shared-core';
import { DataContext } from '../DataContext';

export interface CalendarMonth { year: number; month: number }

export interface PendingOverlap { date: DateKey; candidates: Contract[] }

export interface CalendarState {
  contracts: Contract[];
  selected?: Contract;
  entries: Record<DateKey, CalendarEntry>;
  holidays: Holiday[];
  selectionType: EntryType;
  months: CalendarMonth[];
  totals: Totals;
  remaining: Remaining;
  readOnly: boolean;
  pendingOverlap?: PendingOverlap;
  error?: string;
  /** True until the user and contracts, then the selected contract's entries, have loaded. */
  loading: boolean;
  /** Set when the selected contract's entries could not be loaded; the grid stays locked until retryLoad() succeeds. */
  loadError?: string;
  currentUser?: UserInfo;
  today: DateKey;
}

export interface CalendarActions {
  selectContract(id: number): void;
  setSelectionType(t: EntryType): void;
  clickDay(date: DateKey): Promise<void>;
  /** null cancels (dialog dismissed). */
  resolveOverlap(contractId: number | null): Promise<void>; // eslint-disable-line @rushstack/no-new-null
  /** Weekend (when configured), holiday, or outside the selected contract's period. */
  isDayBlocked(date: DateKey): boolean;
  retryLoad(): void;
  dismissError(): void;
}

const MAX_MONTHS = 12;

const EMPTY_ENTRIES: Record<DateKey, CalendarEntry> = {};
const EMPTY_REMAINING: Remaining = { onSite: 0, offSite: 0, total: 0, onSiteOver: false, offSiteOver: false };

/**
 * Months to render for a contract: its whole span, starting at the current month while the contract
 * is running, capped at `monthsToShow` (12 when 0).
 */
export function computeMonths(
  contract: Pick<Contract, 'startDate' | 'latestExecutionDate'>,
  monthsToShow: number,
  today: DateKey
): CalendarMonth[] {
  const running = isWithin(today, contract.startDate, contract.latestExecutionDate);
  const from = running ? today.substring(0, 8) + '01' : contract.startDate;
  const cap = monthsToShow > 0 ? Math.min(monthsToShow, MAX_MONTHS) : MAX_MONTHS;
  return monthsBetween(from, contract.latestExecutionDate).slice(0, cap);
}

/** initialContractId if visible, else the first contract covering today, else the first. */
export function pickDefaultContract(contracts: Contract[], today: DateKey, initialContractId?: number): Contract | undefined {
  return contracts.find(c => c.id === initialContractId)
    || contracts.find(c => isWithin(today, c.startDate, c.latestExecutionDate))
    || contracts[0];
}

/** Write bookkeeping for one date: which write is the latest, and the last value the server confirmed. */
interface DateWrites {
  latest: number;
  latestState: 'pending' | 'ok' | 'failed';
  confirmed: CalendarEntry | undefined;
  confirmedToken: number;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function withEntry(entries: Record<DateKey, CalendarEntry>, date: DateKey, entry: CalendarEntry | undefined): Record<DateKey, CalendarEntry> {
  const next = { ...entries };
  if (entry) { next[date] = entry; } else { delete next[date]; }
  return next;
}

export function useCalendarState(): CalendarState & CalendarActions {
  const { service, props } = React.useContext(DataContext);
  const today = toDateKey(new Date());

  const [currentUser, setCurrentUser] = React.useState<UserInfo | undefined>();
  const [contracts, setContracts] = React.useState<Contract[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | undefined>();
  const [entries, setEntries] = React.useState<Record<DateKey, CalendarEntry>>({});
  const [holidays, setHolidays] = React.useState<Holiday[]>([]);
  const [selectionType, setSelectionType] = React.useState<EntryType>('OffSiteFull');
  const [pendingOverlap, setPendingOverlap] = React.useState<PendingOverlap | undefined>();
  const [error, setError] = React.useState<string | undefined>();
  const [loadingContracts, setLoadingContracts] = React.useState(true);
  const [loadedContractId, setLoadedContractId] = React.useState<number | undefined>();
  const [loadError, setLoadError] = React.useState<string | undefined>();
  const [reloadNonce, setReloadNonce] = React.useState(0);

  // Async callbacks compare against the latest selection, not the one captured at click time.
  const selectedIdRef = React.useRef<number | undefined>(selectedId);
  selectedIdRef.current = selectedId;
  const writes = React.useRef<Record<DateKey, DateWrites>>({});
  const writeCounter = React.useRef(0);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  // Initial load; re-runs when the data service is rebuilt.
  React.useEffect(() => {
    let cancelled = false;
    setLoadingContracts(true);
    setLoadError(undefined);
    Promise.all([service.getCurrentUser(), service.getMyContracts()])
      .then(([user, mine]) => {
        if (cancelled) { return; }
        setCurrentUser(user);
        setContracts(mine);
        setSelectedId(prev => (prev !== undefined && mine.some(c => c.id === prev))
          ? prev
          : pickDefaultContract(mine, toDateKey(new Date()), props.initialContractId)?.id);
        setLoadingContracts(false);
      })
      .catch(e => {
        if (cancelled) { return; }
        setLoadError(messageOf(e));
        setLoadingContracts(false);
      });
    return () => { cancelled = true; };
    // initialContractId only matters for the first pick, so it is not a dependency.
  }, [service, reloadNonce]);

  const selected = React.useMemo(() => contracts.find(c => c.id === selectedId), [contracts, selectedId]);

  const selectedRef = React.useRef<Contract | undefined>(selected);
  selectedRef.current = selected;

  // Entries and holidays for the whole contract period (stats cover the full contract, not just the shown months).
  // Keyed on the contract id, not the object: a contracts reload yields new objects for the same selection.
  // Until a load succeeds the grid is locked (loadedContractId unset), so nobody edits data that was never seen.
  React.useEffect(() => {
    setLoadedContractId(undefined);
    setPendingOverlap(undefined);
    writes.current = {}; // outcomes of writes started before this load are ignored
    const contract = selectedRef.current;
    if (!contract) { return; }
    let cancelled = false;
    setLoadError(undefined);
    Promise.all([
      service.getEntries(contract.id, contract.startDate, contract.latestExecutionDate),
      service.getHolidays(contract.country, contract.startDate, contract.latestExecutionDate)
    ])
      .then(([list, hols]) => {
        if (cancelled) { return; }
        const map: Record<DateKey, CalendarEntry> = {};
        for (const e of list) { map[e.date] = e; }
        writes.current = {};
        setEntries(map);
        setHolidays(hols);
        setError(undefined);
        setLoadedContractId(contract.id);
      })
      .catch(e => {
        if (cancelled) { return; }
        setEntries({});
        setHolidays([]);
        setLoadError(messageOf(e));
      });
    return () => { cancelled = true; };
  }, [service, selectedId, reloadNonce]);

  const readOnly = !selected || !currentUser || selected.contractor.id !== currentUser.id;

  const isDayBlocked = React.useCallback((date: DateKey): boolean => {
    if (!selected) { return true; }
    if (!isWithin(date, selected.startDate, selected.latestExecutionDate)) { return true; }
    return isBlocked(date, holidays, selected.country, !!props.blockWeekends);
  }, [selected, holidays, props.blockWeekends]);

  /**
   * Optimistic write. Writes to one date are ordered by a token: only the latest write's outcome is shown,
   * and a failure rolls back to the newest server-confirmed value, never to a click-time snapshot.
   * Local state only tracks the selected contract: writing to a sibling moves the date off it.
   */
  const write = React.useCallback(async (contractId: number, date: DateKey, type: EntryType | undefined, current: CalendarEntry | undefined): Promise<void> => {
    const shownId = selectedIdRef.current;
    let rec = writes.current[date];
    if (!rec) {
      // First write since the load: what is on screen is what the server has.
      rec = { latest: 0, latestState: 'ok', confirmed: current, confirmedToken: 0 };
      writes.current[date] = rec;
    }
    const book = rec;
    const token = ++writeCounter.current;
    // Object.assign keeps TypeScript from narrowing latestState to 'pending' across the awaits below.
    Object.assign(book, { latest: token, latestState: 'pending' });
    // Ignore outcomes after unmount, a reload (bookkeeping replaced) or a contract switch.
    const live = (): boolean => mounted.current && writes.current[date] === book && shownId === selectedIdRef.current;

    setEntries(prev => withEntry(prev, date, type && contractId === shownId ? { contractId, date, type } : undefined));
    try {
      let shown: CalendarEntry | undefined;
      if (type) {
        const saved = await service.upsertEntry({ contractId, date, type });
        shown = contractId === shownId ? saved : undefined;
      } else {
        await service.deleteEntry(contractId, date);
        shown = undefined;
      }
      if (!live()) { return; }
      if (token > book.confirmedToken) {
        book.confirmed = shown;
        book.confirmedToken = token;
      }
      if (token === book.latest) {
        book.latestState = 'ok';
        setEntries(prev => withEntry(prev, date, shown));
        setError(undefined);
      } else if (book.latestState === 'failed') {
        // The latest write already failed and rolled back; this older success is now the truth.
        setEntries(prev => withEntry(prev, date, book.confirmed));
      }
    } catch (e) {
      if (!live() || token !== book.latest) { return; }
      book.latestState = 'failed';
      setEntries(prev => withEntry(prev, date, book.confirmed));
      setError(messageOf(e));
    }
  }, [service]);

  const clickDay = React.useCallback(async (date: DateKey): Promise<void> => {
    if (readOnly || !selected || !currentUser || loadedContractId !== selected.id || isDayBlocked(date)) { return; }
    const existing = entries[date];
    if (existing && existing.type === selectionType) {
      await write(selected.id, date, undefined, existing);
      return;
    }
    const mine = contracts.filter(c => c.contractor.id === currentUser.id);
    const covering = contractsCoveringDate(mine, date);
    if (covering.length > 1) {
      const candidates = covering.slice().sort((a, b) => compareKeys(a.startDate, b.startDate));
      setPendingOverlap({ date, candidates });
      return;
    }
    await write(selected.id, date, selectionType, existing);
  }, [readOnly, selected, currentUser, loadedContractId, isDayBlocked, entries, selectionType, contracts, write]);

  const resolveOverlap = React.useCallback(async (contractId: number | null): Promise<void> => {
    const pending = pendingOverlap;
    setPendingOverlap(undefined);
    if (!pending || contractId === null) { return; }
    if (!pending.candidates.some(c => c.id === contractId)) { return; }
    await write(contractId, pending.date, selectionType, entries[pending.date]);
  }, [pendingOverlap, selectionType, entries, write]);

  const selectContract = React.useCallback((id: number): void => {
    setPendingOverlap(undefined);
    setSelectedId(id);
  }, []);

  const visibleEntries = selected && loadedContractId === selected.id ? entries : EMPTY_ENTRIES;
  const totals = React.useMemo(() => computeTotals(Object.keys(visibleEntries).map(k => visibleEntries[k])), [visibleEntries]);
  const remaining = selected ? computeRemaining(selected, totals) : EMPTY_REMAINING;
  const months = React.useMemo(
    () => selected ? computeMonths(selected, props.monthsToShow || 0, today) : [],
    [selected, props.monthsToShow, today]
  );
  const loading = loadingContracts || (!!selected && loadedContractId !== selected.id && !loadError);
  const retryLoad = React.useCallback((): void => { setReloadNonce(n => n + 1); }, []);
  const dismissError = React.useCallback((): void => { setError(undefined); }, []);

  return {
    contracts,
    selected,
    entries: visibleEntries,
    holidays,
    selectionType,
    months,
    totals,
    remaining,
    readOnly,
    pendingOverlap,
    error,
    loading,
    currentUser,
    today,
    selectContract,
    setSelectionType,
    clickDay,
    resolveOverlap,
    isDayBlocked,
    loadError,
    retryLoad,
    dismissError
  };
}
