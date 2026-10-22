export type ToastKind = 'success' | 'error' | 'info' | 'brand';

export interface ToastOptions {
  kind: ToastKind;
  title: string;
  text?: string;
  /** Shown under the text; opens in a new tab. */
  link?: { href: string; label: string };
  /** Single action button; the toast closes when it is used. */
  action?: { label: string; onClick(): void };
  /** Auto-dismiss delay; default 15000. Zero, negative or non-finite values keep the toast until it is closed. */
  durationMs?: number;
  /**
   * While a toast with the same key is visible, a new one is not added: the visible toast takes the new
   * content, its timer restarts, and its id is returned.
   */
  dedupeKey?: string;
}

export interface ToastEntry extends ToastOptions {
  id: string;
  /** Bumped when a duplicate refreshes the toast; restarts its timer. */
  rev: number;
}

export const MAX_TOASTS = 3;
export const DEFAULT_TOAST_DURATION_MS = 15000;

/** One object per page and major version, shared by every bundle. */
export interface ToastStore {
  v: 1;
  toasts: ToastEntry[];
  counter: number;
  listeners: Array<() => void>;
  host?: HTMLElement;
  /** Set by the bundle that mounted the host; tears the host down with that bundle's own ReactDOM. */
  unmount?: () => void;
  /** Brand toast already shown on this page, by storage key (used when storage is unavailable). */
  brandShown: Record<string, true>;
}

declare global {
  interface Window { __orpheusToasts_v1?: ToastStore }
}

export const STORE_KEY = '__orpheusToasts_v1';
export const HOST_ID = 'orpheus-toast-host-v1';

/** Never replaces an existing store: a second bundle joins the first one's stack. */
export function getStore(): ToastStore {
  const w = window;
  if (!w.__orpheusToasts_v1) {
    w.__orpheusToasts_v1 = { v: 1, toasts: [], counter: 0, listeners: [], brandShown: {} };
  }
  return w.__orpheusToasts_v1;
}

function emit(store: ToastStore): void {
  store.listeners.slice().forEach(l => l());
}

export function subscribe(listener: () => void): () => void {
  const store = getStore();
  store.listeners.push(listener);
  return () => { store.listeners = store.listeners.filter(l => l !== listener); };
}

export function addToast(options: ToastOptions): string {
  const store = getStore();
  if (options.dedupeKey !== undefined) {
    const dup = store.toasts.filter(t => t.dedupeKey === options.dedupeKey)[0];
    if (dup) {
      store.toasts = store.toasts.map(t => (t === dup ? { ...options, id: dup.id, rev: dup.rev + 1 } : t));
      emit(store);
      return dup.id;
    }
  }
  const id = `orpheus-toast-${++store.counter}`;
  // Newest first; the oldest beyond the limit drops off.
  store.toasts = [{ ...options, id, rev: 0 }, ...store.toasts].slice(0, MAX_TOASTS);
  emit(store);
  return id;
}

export function removeToast(id: string): void {
  const store = getStore();
  if (!store.toasts.some(t => t.id === id)) { return; }
  store.toasts = store.toasts.filter(t => t.id !== id);
  emit(store);
}

/** The toasts currently on screen, newest first. */
export function activeToasts(): ToastEntry[] {
  return getStore().toasts;
}
