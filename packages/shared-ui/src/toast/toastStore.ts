export type ToastKind = 'success' | 'error' | 'info' | 'brand';

export interface ToastOptions {
  kind: ToastKind;
  title: string;
  text?: string;
  /** Shown under the text; opens in a new tab. */
  link?: { href: string; label: string };
  /** Single action button; the toast closes when it is used. */
  action?: { label: string; onClick(): void };
  /** Auto-dismiss delay; default 15000. */
  durationMs?: number;
}

export interface ToastEntry extends ToastOptions { id: string }

export const MAX_TOASTS = 3;
export const DEFAULT_TOAST_DURATION_MS = 15000;

export interface ToastStore {
  v: 1;
  toasts: ToastEntry[];
  counter: number;
  listeners: Array<() => void>;
  host?: HTMLElement;
}

declare global {
  interface Window { __orpheusToasts?: ToastStore }
}

/**
 * The store is one object per page, kept on window so that every SPFx component (web part, customizers,
 * even from different bundles) shares one stack and one host.
 */
export function getStore(): ToastStore {
  const w = window;
  if (!w.__orpheusToasts || w.__orpheusToasts.v !== 1) {
    w.__orpheusToasts = { v: 1, toasts: [], counter: 0, listeners: [] };
  }
  return w.__orpheusToasts;
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
  const id = `orpheus-toast-${++store.counter}`;
  // Newest first; the oldest beyond the limit drops off.
  store.toasts = [{ ...options, id }, ...store.toasts].slice(0, MAX_TOASTS);
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
