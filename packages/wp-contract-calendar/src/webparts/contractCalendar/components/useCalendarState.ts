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

  // Async callbacks compare against the latest selection, not the one captured at click time.
  const selectedIdRef = React.useRef<number | undefined>(selectedId);
  selectedIdRef.current = selectedId;
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  // Initial load; re-runs when the data service is rebuilt.
  React.useEffect(() => {
    let cancelled = false;
    setLoadingContracts(true);
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
        setError(messageOf(e));
        setLoadingContracts(false);
      });
    return () => { cancelled = true; };
    // initialContractId only matters for the first pick, so it is not a dependency.
  }, [service]);

  const selected = React.useMemo(() => contracts.find(c => c.id === selectedId), [contracts, selectedId]);

  // Entries and holidays for the whole contract period (stats cover the full contract, not just the shown months).
  React.useEffect(() => {
    if (!selected) { return; }
    let cancelled = false;
    Promise.all([
      service.getEntries(selected.id, selected.startDate, selected.latestExecutionDate),
      service.getHolidays(selected.country, selected.startDate, selected.latestExecutionDate)
    ])
      .then(([list, hols]) => {
        if (cancelled) { return; }
        const map: Record<DateKey, CalendarEntry> = {};
        for (const e of list) { map[e.date] = e; }
        setEntries(map);
        setHolidays(hols);
        setLoadedContractId(selected.id);
      })
      .catch(e => {
        if (cancelled) { return; }
        setEntries({});
        setHolidays([]);
        setError(messageOf(e));
        setLoadedContractId(selected.id);
      });
    return () => { cancelled = true; };
  }, [service, selected]);

  const readOnly = !selected || !currentUser || selected.contractor.id !== currentUser.id;

  const isDayBlocked = React.useCallback((date: DateKey): boolean => {
    if (!selected) { return true; }
    if (!isWithin(date, selected.startDate, selected.latestExecutionDate)) { return true; }
    return isBlocked(date, holidays, selected.country, !!props.blockWeekends);
  }, [selected, holidays, props.blockWeekends]);

  /** Optimistic write with per-date rollback; local state only tracks the selected contract. */
  const write = React.useCallback(async (contractId: number, date: DateKey, type: EntryType | undefined, previous: CalendarEntry | undefined): Promise<void> => {
    const shownId = selectedIdRef.current;
    const optimistic: CalendarEntry | undefined = type && contractId === shownId ? { contractId, date, type } : undefined;
    // Writing to a sibling contract moves the date off the shown one.
    setEntries(prev => withEntry(prev, date, optimistic));
    try {
      if (type) {
        const saved = await service.upsertEntry({ contractId, date, type });
        if (mounted.current && contractId === selectedIdRef.current) {
          setEntries(prev => withEntry(prev, date, saved));
        }
      } else {
        await service.deleteEntry(contractId, date);
      }
      if (mounted.current) { setError(undefined); }
    } catch (e) {
      if (!mounted.current) { return; }
      if (shownId === selectedIdRef.current) {
        setEntries(prev => withEntry(prev, date, previous));
      }
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
  const loading = loadingContracts || (!!selected && loadedContractId !== selected.id);

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
    isDayBlocked
  };
}
