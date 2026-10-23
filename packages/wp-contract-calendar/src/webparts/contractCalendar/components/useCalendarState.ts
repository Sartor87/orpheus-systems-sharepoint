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
import { buildTimesheetModel } from '@orpheussystems/shared-ui/timesheet';
import type { TimesheetModel } from '@orpheussystems/shared-ui/timesheet';
// Type-only: a value import would pull pdfmake into the main bundle.
import type { TemplateInput } from '@orpheussystems/shared-ui/pdf';
import { DataContext } from '../DataContext';
import type { TimesheetTemplateSource } from '../templateSource';
import { timesheetFileName } from './timesheetFileName';
import { eligibleDates } from './rangeSelection';
import { formatShortDate } from './calendarFormat';
import { dismissToast, showToast } from '@orpheussystems/shared-ui/toast';
import type { ToastOptions } from '@orpheussystems/shared-ui/toast';
import type { RangeMode } from './rangeSelection';

/** Outcome of one date write as far as the screen is concerned. */
type WriteOutcome = 'ok' | 'failed' | 'stale';

/** The lazily loaded PDF module; kept out of the main bundle (it pulls in pdfmake). */
export interface TimesheetPdfModule {
  downloadTimesheet(model: TimesheetModel, fileName: string): Promise<void>;
  /** Throws an error named 'TemplateValidationError' (with `errors: string[]`) instead of downloading. */
  downloadTimesheetFromTemplate(model: TimesheetModel, input: TemplateInput, fileName: string): Promise<void>;
  sampleTimesheetTemplate: string;
}

export interface CalendarStateOptions {
  /** Test seam: replaces the dynamic import of the PDF module. */
  loadPdf?: () => Promise<TimesheetPdfModule>;
  /** Test seam: overrides the template source from the data context. */
  templateSource?: TimesheetTemplateSource;
}

const defaultLoadPdf = (): Promise<TimesheetPdfModule> =>
  import(/* webpackChunkName: 'orpheus-timesheet-pdf' */ '@orpheussystems/shared-ui/pdf');

export interface CalendarMonth { year: number; month: number }

export interface PendingOverlap {
  /** Days covered by more than one of the user's contracts, ascending; one day for a single click. */
  dates: DateKey[];
  candidates: Contract[];
  /**
   * Range only: the rest of the range, held back until the question is answered and then written to the
   * selected contract (also on cancel). Undefined for a single click.
   */
  deferred?: DateKey[];
}

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
  /** Last timesheet generation failure; shown inside the timesheet dialog. */
  timesheetError?: string;
  /** True until the user and contracts, then the selected contract's entries, have loaded. */
  loading: boolean;
  /** Set when the selected contract's entries could not be loaded; the grid stays locked until retryLoad() succeeds. */
  loadError?: string;
  currentUser?: UserInfo;
  today: DateKey;
  generating: boolean;
}

export interface CalendarActions {
  selectContract(id: number): void;
  setSelectionType(t: EntryType): void;
  clickDay(date: DateKey): Promise<void>;
  /**
   * Paints the selected type on, or erases it from, every eligible day of `dates` (blocked days are skipped).
   * Painting days covered by two of the user's contracts asks once through `pendingOverlap`.
   */
  applyRange(dates: DateKey[], mode: RangeMode): Promise<void>;
  /** null cancels (dialog dismissed); for a range the non-overlap days are still written. */
  resolveOverlap(contractId: number | null): Promise<void>; // eslint-disable-line @rushstack/no-new-null
  /** Weekend (when configured), holiday, or outside the selected contract's period. */
  isDayBlocked(date: DateKey): boolean;
  retryLoad(): void;
  /** Fetches the whole period (not just the shown months) and downloads the PDF. Failures surface through `timesheetError`. */
  generateTimesheet(period: { from: DateKey; to: DateKey }): Promise<boolean>;
  clearTimesheetError(): void;
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

interface WriteItem { contractId: number; date: DateKey; type: EntryType | undefined; current: CalendarEntry | undefined }

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * A service write that has not answered after this long is reported as failed and rolled back, so later writes
 * to that date are not queued behind it forever. The request itself cannot be cancelled and may still land.
 */
export const WRITE_TIMEOUT_MS = 30000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('SharePoint did not answer in time. Reload the page to see what was saved.'));
    }, ms);
    p.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

const MAX_TEMPLATE_ERRORS = 5;

/** Duck-typed: the error class lives in the lazy PDF chunk, so instanceof is not available here. */
function templateErrorsOf(e: unknown): string[] | undefined {
  const err = e as { name?: unknown; errors?: unknown } | null;
  return err && err.name === 'TemplateValidationError' && Array.isArray(err.errors) ? err.errors.map(String) : undefined;
}

function timesheetErrorMessage(e: unknown): string {
  const errors = templateErrorsOf(e);
  if (!errors) { return `Could not generate the timesheet: ${messageOf(e)}`; }
  const shown = errors.slice(0, MAX_TEMPLATE_ERRORS);
  const more = errors.length - shown.length;
  return 'The timesheet template has errors:\n• ' + shown.join('\n• ')
    + (more > 0 ? `\n• …and ${more} more` : '')
    + '\nAsk your site owner to fix the template or clear the template setting to use the standard layout.';
}

function withEntry(entries: Record<DateKey, CalendarEntry>, date: DateKey, entry: CalendarEntry | undefined): Record<DateKey, CalendarEntry> {
  const next = { ...entries };
  if (entry) { next[date] = entry; } else { delete next[date]; }
  return next;
}

export function useCalendarState(options: CalendarStateOptions = {}): CalendarState & CalendarActions {
  const { service, props, templateSource: contextTemplateSource } = React.useContext(DataContext);
  const today = toDateKey(new Date());

  const [currentUser, setCurrentUser] = React.useState<UserInfo | undefined>();
  const [contracts, setContracts] = React.useState<Contract[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | undefined>();
  const [entries, setEntries] = React.useState<Record<DateKey, CalendarEntry>>({});
  const [holidays, setHolidays] = React.useState<Holiday[]>([]);
  const [selectionType, setSelectionType] = React.useState<EntryType>('OffSiteFull');
  const [pendingOverlap, setPendingOverlap] = React.useState<PendingOverlap | undefined>();
  const [loadingContracts, setLoadingContracts] = React.useState(true);
  const [loadedContractId, setLoadedContractId] = React.useState<number | undefined>();
  const [loadError, setLoadError] = React.useState<string | undefined>();
  const [reloadNonce, setReloadNonce] = React.useState(0);
  const [generating, setGenerating] = React.useState(false);
  const [timesheetError, setTimesheetError] = React.useState<string | undefined>();
  const generatingRef = React.useRef(false);
  const loadPdfRef = React.useRef(options.loadPdf || defaultLoadPdf);
  loadPdfRef.current = options.loadPdf || defaultLoadPdf;
  const templateSourceRef = React.useRef<TimesheetTemplateSource | undefined>(undefined);
  templateSourceRef.current = options.templateSource || contextTemplateSource;

  // Async callbacks compare against the latest selection, not the one captured at click time.
  const selectedIdRef = React.useRef<number | undefined>(selectedId);
  selectedIdRef.current = selectedId;
  const writes = React.useRef<Record<DateKey, DateWrites>>({});
  const writeCounter = React.useRef(0);
  // Service writes per date run one at a time: a SharePoint upsert (delete siblings + add) and a delete are
  // separate batches whose server-side order is not guaranteed if both are in flight.
  const writeChains = React.useRef<Record<DateKey, Promise<unknown>>>({});
  const mounted = React.useRef(true);
  // Toasts raised by this calendar instance; dismissed on contract switch and unmount.
  const instanceId = React.useRef(Math.random().toString(36).slice(2, 8)).current;
  const writeKey = `contract-calendar:${instanceId}:write`;
  const countedKey = `contract-calendar:${instanceId}:counted`;
  const ownToasts = React.useRef<string[]>([]);
  const raise = React.useCallback((o: ToastOptions): string => {
    const id = showToast(o);
    if (ownToasts.current.indexOf(id) < 0) { ownToasts.current.push(id); }
    return id;
  }, []);
  React.useEffect(() => () => {
    ownToasts.current.splice(0).forEach(dismissToast);
  }, [selectedId]);
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

  const contractsRef = React.useRef<Contract[]>(contracts);
  contractsRef.current = contracts;
  const titleOf = (id: number): string => (contractsRef.current.filter(c => c.id === id)[0] || { title: 'the contract' }).title;

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
    // Writes still in flight (e.g. started before a switch away and back) land first; otherwise the load could
    // miss them and their outcome is ignored, leaving the grid and stats stale until the next reload.
    const pending = Object.keys(writeChains.current).map(d => writeChains.current[d].catch(() => undefined));
    Promise.all(pending)
      .then(() => Promise.all([
        service.getEntries(contract.id, contract.startDate, contract.latestExecutionDate),
        service.getHolidays(contract.country, contract.startDate, contract.latestExecutionDate)
      ]))
      .then(([list, hols]) => {
        if (cancelled) { return; }
        const map: Record<DateKey, CalendarEntry> = {};
        for (const e of list) { map[e.date] = e; }
        writes.current = {};
        setEntries(map);
        setHolidays(hols);
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
   * In a batch the caller reports errors (one summary for the range), so this write stays quiet.
   */
  // Retry buttons in toasts call the newest write functions through these refs (assigned below).
  /** A Retry only makes sense on the contract that was shown when the failure happened. */
  const retryOn = (shownId: number | undefined, run: () => Promise<unknown>): void => {
    if (selectedIdRef.current !== shownId) {
      raise({ kind: 'info', title: `Switch back to ${shownId === undefined ? 'the contract' : titleOf(shownId)} to retry.` });
      return;
    }
    run().catch(() => undefined);
  };
  const writeRef = React.useRef<(c: number, d: DateKey, t: EntryType | undefined, cur: CalendarEntry | undefined) => Promise<WriteOutcome>>(
    () => Promise.resolve('stale')
  );
  const writeManyRef = React.useRef<(items: WriteItem[]) => Promise<void>>(() => Promise.resolve());
  const write = React.useCallback(async (
    contractId: number, date: DateKey, type: EntryType | undefined, current: CalendarEntry | undefined, batch: boolean = false, successTitle?: string | null
  ): Promise<WriteOutcome> => {
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
    const send = (): Promise<CalendarEntry | undefined> => type
      ? service.upsertEntry({ contractId, date, type })
      : service.deleteEntry(contractId, date).then(() => undefined);
    const prior = writeChains.current[date];
    // Chained after the previous write for this date, whatever its outcome; issued at once when idle.
    const op = withTimeout(prior ? prior.catch(() => undefined).then(send) : send(), WRITE_TIMEOUT_MS);
    writeChains.current[date] = op;
    const release = (): void => {
      if (writeChains.current[date] === op) { delete writeChains.current[date]; }
    };
    op.then(release, release);
    try {
      const saved = await op;
      const shown: CalendarEntry | undefined = type && contractId === shownId ? saved : undefined;
      if (!live()) { return 'stale'; }
      if (token > book.confirmedToken) {
        book.confirmed = shown;
        book.confirmedToken = token;
      }
      if (token === book.latest) {
        book.latestState = 'ok';
        setEntries(prev => withEntry(prev, date, shown));
        if (!batch) {
          if (type && successTitle !== null) {
            raise({ kind: 'success', title: successTitle || `Saved ${formatShortDate(date)}`, text: successTitle ? undefined : titleOf(contractId), dedupeKey: successTitle ? countedKey : writeKey });
          }
        }
        return 'ok';
      }
      if (book.latestState === 'failed') {
        // The latest write already failed and rolled back; this older success is now the truth.
        setEntries(prev => withEntry(prev, date, book.confirmed));
      }
      return 'stale';
    } catch (e) {
      if (!live() || token !== book.latest) { return 'stale'; }
      book.latestState = 'failed';
      setEntries(prev => withEntry(prev, date, book.confirmed));
      if (!batch) {
        raise({
          kind: 'error',
          title: `Could not save ${formatShortDate(date)}`,
          text: messageOf(e),
          action: { label: 'Retry', onClick: () => { retryOn(shownId, () => writeRef.current(contractId, date, type, book.confirmed)); } }
        });
      }
      return 'failed';
    }
  }, [service]);

  writeRef.current = (c, d, t, cur) => write(c, d, t, cur);

  /** Writes several dates at once (each on its own per-date path) and reports failures as one summary. */
  const writeMany = React.useCallback(async (
    items: WriteItem[],
    counted?: { title: string; dates: DateKey[] }
  ): Promise<void> => {
    if (items.length === 0) { return; }
    const shownId = selectedIdRef.current;
    const outcomes = await Promise.all(items.map(i => write(i.contractId, i.date, i.type, i.current, true)));
    if (!mounted.current || shownId !== selectedIdRef.current) { return; }
    const failedItems = items.filter((_, i) => outcomes[i] === 'failed');
    const failed = failedItems.length;
    if (failed > 0) {
      raise({
        kind: 'error',
        title: `${failed} of ${items.length} days could not be saved`,
        action: { label: 'Retry', onClick: () => { retryOn(shownId, () => writeManyRef.current(failedItems)); } }
      });
      return;
    }
    const okTyped = items.filter((i, idx) => outcomes[idx] === 'ok' && i.type);
    const isCounted = (i: WriteItem): boolean => !!counted && counted.dates.indexOf(i.date) >= 0;
    const countedItems = okTyped.filter(isCounted);
    const savedItems = okTyped.filter(i => !isCounted(i));
    const days = (n: number): string => `${n} day${n === 1 ? '' : 's'}`;
    if (counted && countedItems.length > 0) {
      raise({ kind: 'success', title: `Counted ${days(countedItems.length)} against ${counted.title}`, dedupeKey: countedKey });
    }
    if (savedItems.length === 1) {
      raise({ kind: 'success', title: `Saved ${formatShortDate(savedItems[0].date)}`, text: titleOf(savedItems[0].contractId), dedupeKey: writeKey });
    } else if (savedItems.length > 1) {
      raise({ kind: 'success', title: `Saved ${days(savedItems.length)} to ${titleOf(savedItems[0].contractId)}`, dedupeKey: writeKey });
    }
  }, [write]);
  writeManyRef.current = items => writeMany(items);

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
      setPendingOverlap({ dates: [date], candidates });
      return;
    }
    await write(selected.id, date, selectionType, existing);
  }, [readOnly, selected, currentUser, loadedContractId, isDayBlocked, entries, selectionType, contracts, write]);

  const applyRange = React.useCallback(async (dates: DateKey[], mode: RangeMode): Promise<void> => {
    if (readOnly || !selected || !currentUser || loadedContractId !== selected.id) { return; }
    const days = eligibleDates(dates, isDayBlocked).slice().sort(compareKeys);
    if (mode === 'erase') {
      // Same as a single-click clear: only what the shown contract holds; a sibling contract's days are left alone.
      await writeMany(days
        .filter(d => entries[d]?.type === selectionType)
        .map(d => ({ contractId: selected.id, date: d, type: undefined, current: entries[d] })));
      return;
    }
    const targets = days.filter(d => entries[d]?.type !== selectionType);
    const mine = contracts.filter(c => c.contractor.id === currentUser.id);
    const overlap: DateKey[] = [];
    const rest: DateKey[] = [];
    const candidates: Contract[] = [];
    for (const d of targets) {
      const covering = contractsCoveringDate(mine, d);
      if (covering.length > 1) {
        overlap.push(d);
        covering.forEach(c => { if (!candidates.some(x => x.id === c.id)) { candidates.push(c); } });
      } else {
        rest.push(d);
      }
    }
    if (overlap.length > 0) {
      // Nothing is written until the one question is answered.
      candidates.sort((a, b) => compareKeys(a.startDate, b.startDate));
      setPendingOverlap({ dates: overlap, candidates, deferred: rest });
      return;
    }
    await writeMany(rest.map(d => ({ contractId: selected.id, date: d, type: selectionType, current: entries[d] })));
  }, [readOnly, selected, currentUser, loadedContractId, isDayBlocked, entries, selectionType, contracts, writeMany]);

  const resolveOverlap = React.useCallback(async (contractId: number | null): Promise<void> => {
    const pending = pendingOverlap;
    setPendingOverlap(undefined);
    if (!pending) { return; }
    const chosen = contractId === null ? undefined : pending.candidates.filter(c => c.id === contractId)[0];
    if (!pending.deferred) {
      // Single click: unchanged behaviour (cancel or an unknown id writes nothing).
      if (chosen) { await write(chosen.id, pending.dates[0], selectionType, entries[pending.dates[0]], false, `Counted 1 day against ${chosen.title}`); }
      return;
    }
    const shown = selectedRef.current;
    if (!shown) { return; }
    const items = pending.deferred.map(d => ({ contractId: shown.id, date: d, type: selectionType, current: entries[d] }));
    if (chosen) {
      // With three or more contracts the chosen one may not cover every overlap day. Those days go to the shown
      // contract, which covers every day of the range (days outside its period were filtered out as blocked).
      pending.dates.forEach(d => items.push({
        contractId: isWithin(d, chosen.startDate, chosen.latestExecutionDate) ? chosen.id : shown.id,
        date: d, type: selectionType, current: entries[d]
      }));
    }
    await writeMany(items, chosen ? { title: chosen.title, dates: pending.dates } : undefined);
  }, [pendingOverlap, selectionType, entries, write, writeMany]);

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
  const clearTimesheetError = React.useCallback((): void => { setTimesheetError(undefined); }, []);
  const retryLoad = React.useCallback((): void => { setReloadNonce(n => n + 1); }, []);

  const generateTimesheet = React.useCallback(async (period: { from: DateKey; to: DateKey }): Promise<boolean> => {
    const contract = selectedRef.current;
    if (!contract || generatingRef.current) { return false; }
    generatingRef.current = true;
    setTimesheetError(undefined);
    setGenerating(true);
    try {
      // Template only when a path is configured; otherwise the built-in layout, exactly as before.
      const templateUrl = (props.timesheetTemplateUrl || '').trim();
      const source = templateUrl ? templateSourceRef.current : undefined;
      // A configured template never falls back silently to the built-in layout.
      if (templateUrl && !source) { throw new Error(`the timesheet template "${templateUrl}" is set but no template source is available`); }
      // Straight from the service, not the cached display data. getHolidays already merges the '*' (all countries) rows.
      // The template and its contract data are fetched on every generation (no cache), in parallel with the entries.
      // Entries run from the contract start so "Remaining" can subtract the days before the period too.
      const [list, hols, template] = await Promise.all([
        service.getEntries(contract.id, contract.startDate, period.to),
        service.getHolidays(contract.country, period.from, period.to),
        source ? Promise.all([source.loadTemplate(), source.loadTemplateData(contract.id)]) : undefined
      ]);
      const model = buildTimesheetModel(contract, list, hols, period, {
        approvingOrg: props.approvingOrgLabel || 'Client approval',
        serviceProvider: props.serviceProviderLabel || 'Service provider'
      }, { blockWeekends: !!props.blockWeekends });
      const pdf = await loadPdfRef.current();
      const fileName = timesheetFileName(contract, period.from, period.to);
      if (source && template) {
        const [html, templateData] = template;
        await pdf.downloadTimesheetFromTemplate(model, {
          html, contract, templateData, today: toDateKey(new Date()), resolveImage: source.resolveImage
        }, fileName);
      } else {
        await pdf.downloadTimesheet(model, fileName);
      }
      raise({ kind: 'success', title: 'Timesheet downloaded', text: fileName, dedupeKey: `contract-calendar:${instanceId}:timesheet` });
      return true;
    } catch (e) {
      // No fallback to the built-in layout on a template problem: the user sees the error, nothing is downloaded.
      if (mounted.current) { setTimesheetError(timesheetErrorMessage(e)); }
      return false;
    } finally {
      generatingRef.current = false; // eslint-disable-line require-atomic-updates
      if (mounted.current) { setGenerating(false); }
    }
  }, [service, props.approvingOrgLabel, props.serviceProviderLabel, props.timesheetTemplateUrl]);

  return {
    generating,
    timesheetError,
    clearTimesheetError,
    generateTimesheet,
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
    loading,
    currentUser,
    today,
    selectContract,
    setSelectionType,
    clickDay,
    applyRange,
    resolveOverlap,
    isDayBlocked,
    loadError,
    retryLoad
  };
}
