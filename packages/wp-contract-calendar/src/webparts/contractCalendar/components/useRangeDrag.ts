import * as React from 'react';
import { addDays, compareKeys } from '@orpheussystems/shared-core';
import type { DateKey } from '@orpheussystems/shared-core';
import { beyondSlop, datesBetween } from './rangeSelection';
import type { IPoint, RangeMode } from './rangeSelection';

/** Inclusive, ascending bounds of the range being previewed. */
export interface RangePreview { from: DateKey; to: DateKey }

/** One stable set of handlers shared by every day cell; each call names its date. */
export interface IDayHandlers {
  pointerDown(date: DateKey, e: React.PointerEvent<HTMLElement>): void;
  pointerOver(date: DateKey, e: React.PointerEvent<HTMLElement>): void;
  click(date: DateKey, e: React.MouseEvent<HTMLElement>): void;
  keyDown(date: DateKey, e: React.KeyboardEvent<HTMLElement>): void;
}

export interface RangeDragOptions {
  /** False for read-only users and while the grid is locked: every gesture is ignored. */
  enabled: boolean;
  /**
   * Changes whenever the meaning of an anchor changes (selected contract, selection type). A change forgets the
   * Shift+click anchor and any pending range, so a stale paint/erase mode is never reused.
   */
  resetKey: string;
  isDayBlocked(date: DateKey): boolean;
  /** The mode a range anchored on `date` takes, decided when the range starts. */
  modeAt(date: DateKey): RangeMode;
  /** A plain single-day click. */
  onClick(date: DateKey): void;
  onRange(dates: DateKey[], mode: RangeMode): void;
}

export interface RangeDrag {
  preview?: RangePreview;
  /** True while a pointer drag is in progress (the grid then disables touch panning). */
  dragging: boolean;
  /** Callback ref for the element holding all day cells (each carries `data-date`). */
  rootRef(el: HTMLElement | null): void; // eslint-disable-line @rushstack/no-new-null
  handlers: IDayHandlers;
}

interface Pending { anchor: DateKey; current: DateKey; mode: RangeMode }
interface Drag extends Pending { pointerId: number; touch: boolean; start: IPoint; moved: boolean; armed: boolean }

/** A touch press must rest this long (within the slop) before it drags; a quicker or wider swipe scrolls. */
const TOUCH_ARM_MS = 350;

const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

function bounds(a: DateKey, b: DateKey): RangePreview {
  return compareKeys(a, b) <= 0 ? { from: a, to: b } : { from: b, to: a };
}

/** Mouse and pen report the held buttons; zero means the release happened where the page could not see it. */
function releasedUnseen(e: { pointerType: string; buttons: number }): boolean {
  return e.pointerType !== 'touch' && e.buttons === 0;
}

/**
 * Pointer and keyboard range selection over the day cells.
 * Drag: press on a day, move over others (per-cell pointerover, plus elementFromPoint on pointermove for
 * touch/pen), release anywhere to commit; Esc, window blur or pointercancel cancels. Only the pointer that started
 * the drag counts. Shift+click extends from the last clicked day. Shift+Arrow grows a pending range from the
 * focused day; Enter on its end commits, Esc or leaving the grid cancels.
 * Nothing is written until commit; the handlers object never changes identity.
 */
export function useRangeDrag(options: RangeDragOptions): RangeDrag {
  const opts = React.useRef(options);
  opts.current = options;
  const [preview, setPreview] = React.useState<RangePreview | undefined>();
  const [dragging, setDragging] = React.useState(false);

  const api = React.useRef<{ handlers: IDayHandlers; rootRef: RangeDrag['rootRef']; reset(): void; dispose(): void } | undefined>();
  if (!api.current) {
    let root: HTMLElement | undefined;
    let drag: Drag | undefined;
    let keyRange: Pending | undefined;
    let clickAnchor: { date: DateKey; mode: RangeMode } | undefined;
    let suppressClick = false;
    let movingFocus = false;
    let armTimer: ReturnType<typeof setTimeout> | undefined;

    const show = (range: Pending | undefined): void => {
      setPreview(prev => {
        if (!range) { return undefined; }
        const next = bounds(range.anchor, range.current);
        return prev && prev.from === next.from && prev.to === next.to ? prev : next;
      });
    };

    const clearKeyRange = (): void => {
      if (!keyRange) { return; }
      keyRange = undefined;
      setPreview(undefined);
    };

    const moveTo = (date: DateKey): void => {
      if (!drag || !drag.armed || date === drag.current) { return; }
      drag.current = date;
      if (date !== drag.anchor && !drag.moved) {
        drag.moved = true;
        setDragging(true);
      }
      if (drag.moved) { show(drag); }
    };

    const finish = (commit: boolean): void => {
      const d = drag;
      drag = undefined;
      detach(); // eslint-disable-line @typescript-eslint/no-use-before-define
      setPreview(undefined);
      setDragging(false);
      if (!d) { return; }
      // A release over the anchor still fires its click; after a drag (or a cancel) that click is not a toggle.
      if (d.moved || !commit) { suppressClick = true; }
      if (commit && d.moved) {
        clickAnchor = { date: d.anchor, mode: d.mode };
        opts.current.onRange(datesBetween(d.anchor, d.current), d.mode);
      }
    };

    const ours = (ev: PointerEvent): boolean => !!drag && ev.pointerId === drag.pointerId;

    const onPointerMove = (ev: PointerEvent): void => {
      if (!drag || !ours(ev)) { return; }
      if (releasedUnseen(ev)) { finish(false); return; }
      if (drag.touch && !drag.armed) {
        // A finger that wanders before the press has rested is scrolling, not selecting.
        if (beyondSlop(drag.start, { x: ev.clientX, y: ev.clientY })) { finish(false); }
        return;
      }
      if (typeof document.elementFromPoint !== 'function') { return; }
      const cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-date]');
      const date = cell && root && root.contains(cell) ? cell.getAttribute('data-date') : undefined;
      if (date) { moveTo(date); }
    };
    const onPointerUp = (ev: PointerEvent): void => { if (ours(ev)) { finish(true); } };
    const onPointerCancel = (ev: PointerEvent): void => { if (ours(ev)) { finish(false); } };
    const onWindowBlur = (): void => { finish(false); };
    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      }
    };

    const detach = (): void => {
      if (armTimer !== undefined) { clearTimeout(armTimer); armTimer = undefined; }
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onWindowBlur);
    };

    // Root listeners stay attached for the root's lifetime. touchstart/touchmove must be non-passive from the
    // first touch, because the browser decides on panning at touchstart; they only block it once a drag is armed.
    const onTouchStart = (): void => { /* registered non-passive so touchmove may be cancelled */ };
    const onTouchMove = (ev: TouchEvent): void => {
      if (drag && drag.armed && ev.cancelable) { ev.preventDefault(); }
    };
    const onFocusOut = (ev: FocusEvent): void => {
      if (movingFocus || !keyRange) { return; }
      const next = ev.relatedTarget;
      if (!(next instanceof Node) || !root || !root.contains(next)) { clearKeyRange(); }
    };
    const unbindRoot = (): void => {
      if (!root) { return; }
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('focusout', onFocusOut);
      root = undefined;
    };
    const rootRef = (el: HTMLElement | null): void => {
      if (el === root) { return; }
      unbindRoot();
      if (!el) { return; }
      root = el;
      el.addEventListener('touchstart', onTouchStart, { passive: false });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('focusout', onFocusOut);
    };

    const reset = (): void => {
      if (drag) { finish(false); }
      clearKeyRange();
      clickAnchor = undefined;
    };

    const handlers: IDayHandlers = {
      pointerDown(date: DateKey, e: React.PointerEvent<HTMLElement>): void {
        const o = opts.current;
        if (drag) {
          if (e.pointerId !== drag.pointerId) { return; } // a second finger (pinch) neither starts nor ends a drag
          finish(false);
        }
        suppressClick = false;
        if (!o.enabled || e.shiftKey || (typeof e.button === 'number' && e.button !== 0)) { return; }
        clearKeyRange();
        // Touch gives the pressed element implicit capture, which would hide every other cell from hit-testing.
        const el = e.currentTarget;
        if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
        const touch = e.pointerType === 'touch';
        drag = {
          anchor: date, current: date, mode: o.modeAt(date), pointerId: e.pointerId, touch,
          start: { x: e.clientX, y: e.clientY }, moved: false, armed: !touch
        };
        if (touch) {
          armTimer = setTimeout(() => {
            armTimer = undefined;
            if (!drag) { return; }
            drag.armed = true;
            setDragging(true);
            show(drag);
          }, TOUCH_ARM_MS);
        }
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerCancel);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('blur', onWindowBlur);
      },

      pointerOver(date: DateKey, e: React.PointerEvent<HTMLElement>): void {
        if (!drag || e.pointerId !== drag.pointerId) { return; }
        if (releasedUnseen(e)) { finish(false); return; }
        moveTo(date);
      },

      click(date: DateKey, e: React.MouseEvent<HTMLElement>): void {
        const o = opts.current;
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        if (!o.enabled) { return; }
        clearKeyRange();
        if (e.shiftKey && clickAnchor) {
          // The anchor stays put, so further Shift+clicks re-extend from the same day.
          o.onRange(datesBetween(clickAnchor.date, date), clickAnchor.mode);
          return;
        }
        if (o.isDayBlocked(date)) { return; }
        clickAnchor = { date, mode: o.modeAt(date) };
        o.onClick(date);
      },

      keyDown(date: DateKey, e: React.KeyboardEvent<HTMLElement>): void {
        const o = opts.current;
        suppressClick = false;
        if (!o.enabled) { return; }
        const step = ARROWS[e.key];
        if (e.shiftKey && step !== undefined) {
          e.preventDefault();
          const base: Pending = keyRange && keyRange.current === date ? keyRange : { anchor: date, current: date, mode: o.modeAt(date) };
          const next = addDays(base.current, step);
          const target = root?.querySelector<HTMLElement>(`[data-date="${next}"]`);
          if (!target) { return; } // the edge of the shown months
          keyRange = { ...base, current: next };
          show(keyRange);
          movingFocus = true;
          try { target.focus(); } finally { movingFocus = false; }
          return;
        }
        if (!keyRange) { return; }
        if (keyRange.current !== date) {
          // Focus moved on (Tab, click) since the range was extended: it is stale, and this key acts as usual.
          clearKeyRange();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault(); // no click toggle on the focused day
          const k = keyRange;
          clearKeyRange();
          clickAnchor = { date: k.anchor, mode: k.mode };
          o.onRange(datesBetween(k.anchor, k.current), k.mode);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          clearKeyRange();
        }
      }
    };

    api.current = {
      handlers,
      rootRef,
      reset,
      dispose: () => {
        drag = undefined;
        detach();
        unbindRoot();
      }
    };
  }

  const { resetKey } = options;
  React.useEffect(() => { api.current?.reset(); }, [resetKey]);
  React.useEffect(() => () => { api.current?.dispose(); }, []);

  return { preview, dragging, rootRef: api.current.rootRef, handlers: api.current.handlers };
}
