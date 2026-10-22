import * as React from 'react';
import { addDays, compareKeys } from '@orpheussystems/shared-core';
import type { DateKey } from '@orpheussystems/shared-core';
import { datesBetween } from './rangeSelection';
import type { RangeMode } from './rangeSelection';

/** Inclusive, ascending bounds of the range being previewed. */
export interface RangePreview { from: DateKey; to: DateKey }

/** One stable set of handlers shared by every day cell; each call names its date. */
export interface IDayHandlers {
  pointerDown(date: DateKey, e: React.PointerEvent<HTMLElement>): void;
  pointerOver(date: DateKey): void;
  click(date: DateKey, e: React.MouseEvent<HTMLElement>): void;
  keyDown(date: DateKey, e: React.KeyboardEvent<HTMLElement>): void;
}

export interface RangeDragOptions {
  /** False for read-only users and while the grid is locked: every gesture is ignored. */
  enabled: boolean;
  /** The element holding all day cells (each carries `data-date`). */
  rootRef: React.RefObject<HTMLElement>;
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
  handlers: IDayHandlers;
}

interface Pending { anchor: DateKey; current: DateKey; mode: RangeMode }
interface Drag extends Pending { pointerId: number; moved: boolean; armed: boolean }

/** A touch press must rest this long before it drags; a quicker swipe scrolls the page as usual. */
const TOUCH_ARM_MS = 350;

const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

function bounds(a: DateKey, b: DateKey): RangePreview {
  return compareKeys(a, b) <= 0 ? { from: a, to: b } : { from: b, to: a };
}

/**
 * Pointer and keyboard range selection over the day cells.
 * Drag: press on a day, move over others (per-cell pointerover, plus elementFromPoint on pointermove for
 * touch/pen), release anywhere to commit; Esc cancels. Shift+click extends from the last clicked day.
 * Shift+Arrow grows a pending range from the focused day; Enter commits, Esc cancels.
 * Nothing is written until commit; the handlers object never changes identity.
 */
export function useRangeDrag(options: RangeDragOptions): RangeDrag {
  const opts = React.useRef(options);
  opts.current = options;
  const [preview, setPreview] = React.useState<RangePreview | undefined>();
  const [dragging, setDragging] = React.useState(false);

  const api = React.useRef<{ handlers: IDayHandlers; detach(): void } | undefined>();
  if (!api.current) {
    let drag: Drag | undefined;
    let keyRange: Pending | undefined;
    let clickAnchor: { date: DateKey; mode: RangeMode } | undefined;
    let suppressClick = false;
    let armTimer: ReturnType<typeof setTimeout> | undefined;

    const show = (range: Pending | undefined): void => {
      setPreview(prev => {
        if (!range) { return undefined; }
        const next = bounds(range.anchor, range.current);
        return prev && prev.from === next.from && prev.to === next.to ? prev : next;
      });
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

    const onPointerMove = (ev: PointerEvent): void => {
      if (!drag || ev.pointerId !== drag.pointerId || typeof document.elementFromPoint !== 'function') { return; }
      const cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-date]');
      const root = opts.current.rootRef.current;
      const date = cell && root && root.contains(cell) ? cell.getAttribute('data-date') : undefined;
      if (date) { moveTo(date); }
    };
    const onPointerUp = (): void => { finish(true); };
    const onPointerCancel = (): void => { finish(false); };
    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      }
    };
    // Once a touch drag is armed, the finger must not scroll the page.
    const onTouchMove = (ev: TouchEvent): void => {
      if (drag && drag.armed && ev.cancelable) { ev.preventDefault(); }
    };

    const detach = (): void => {
      if (armTimer !== undefined) { clearTimeout(armTimer); armTimer = undefined; }
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('touchmove', onTouchMove);
    };

    const handlers: IDayHandlers = {
      pointerDown(date: DateKey, e: React.PointerEvent<HTMLElement>): void {
        const o = opts.current;
        if (drag) { finish(false); }
        suppressClick = false;
        if (!o.enabled || e.shiftKey || (typeof e.button === 'number' && e.button !== 0)) { return; }
        if (keyRange) { keyRange = undefined; setPreview(undefined); }
        // Touch gives the pressed element implicit capture, which would hide every other cell from hit-testing.
        const el = e.currentTarget;
        if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
        const touch = e.pointerType === 'touch';
        drag = { anchor: date, current: date, mode: o.modeAt(date), pointerId: e.pointerId, moved: false, armed: !touch };
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
        document.addEventListener('touchmove', onTouchMove, { passive: false });
      },

      pointerOver(date: DateKey): void {
        moveTo(date);
      },

      click(date: DateKey, e: React.MouseEvent<HTMLElement>): void {
        const o = opts.current;
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        if (!o.enabled) { return; }
        if (keyRange) { keyRange = undefined; setPreview(undefined); }
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
          const root = o.rootRef.current;
          const target = root?.querySelector<HTMLElement>(`[data-date="${next}"]`);
          if (!target) { return; } // the edge of the shown months
          keyRange = { ...base, current: next };
          show(keyRange);
          target.focus();
          return;
        }
        if (!keyRange) { return; }
        if (e.key === 'Enter') {
          e.preventDefault(); // no click toggle on the focused day
          const k = keyRange;
          keyRange = undefined;
          setPreview(undefined);
          clickAnchor = { date: k.anchor, mode: k.mode };
          o.onRange(datesBetween(k.anchor, k.current), k.mode);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          keyRange = undefined;
          setPreview(undefined);
        }
      }
    };

    api.current = { handlers, detach };
  }

  React.useEffect(() => () => { api.current?.detach(); }, []);

  return { preview, dragging, handlers: api.current.handlers };
}
