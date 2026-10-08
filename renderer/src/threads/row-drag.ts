// DRAGGING A THREAD UP OR DOWN THE LIST (w-6e5b532a95, 2026-10-07): "I'd
// rather be able to drag things around here, move them around, and have that
// priority remembered and that's how the app processes it."
//
// The row is lifted and rides the pointer; the rows it passes slide aside to
// open its new slot; letting go hands the row, the one it now sits in front
// of and the rows as they were drawn to the caller, which works out the place
// (`dropPlaces`, shared/rank.mjs). Escape puts it back. Pointer events and the
// whole window listening until the press ends, the way the board's columns are
// carried (Pages.tsx), because the browser's own drag and drop draws a ghost
// and cancels when the list redraws under it.
//
// EVERY MARK THIS FILE PUTS ON THE PAGE IS A DATA ATTRIBUTE, never a class.
// React owns `className` on these rows, and any re-render mid-drag (the hover,
// the snapshot poll) would write it back and drop a class it does not know.
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { landingRow } from '../project-priority';

// The board's columns settle with the same curve (Pages.tsx).
const SETTLE = { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' };
// How near the edge of a scrolling list the pointer has to be before it
// scrolls, and how fast at the very edge, in px per frame.
const EDGE = 56;
const EDGE_SPEED = 14;

/** How far a row passed by the drag moves to open the slot: up or down one
 *  row's height, or not at all. `to` is the row it lands in front of. */
export function shiftFor(i: number, from: number, to: number, height: number): number {
  if (from < i && i < to) return -height;
  if (to <= i && i < from) return height;
  return 0;
}

/** Whether a drop from `from` in front of `to` would leave the row where it was. */
export const stays = (from: number, to: number) => to === from || to === from + 1;

/** How far the list scrolls this frame with the pointer at `y`: toward the
 *  edge it is near, faster the nearer, and not at all away from both. */
export function edgeScroll(y: number, top: number, bottom: number): number {
  if (y < top + EDGE) return -Math.ceil(EDGE_SPEED * Math.min(1, (top + EDGE - y) / EDGE));
  if (y > bottom - EDGE) return Math.ceil(EDGE_SPEED * Math.min(1, (y - (bottom - EDGE)) / EDGE));
  return 0;
}

// WHETHER ANY ROW IS IN HAND, for the app's snapshot poll: a fresh snapshot
// mid-drag reorders and re-renders the rows under the carried one, so the
// poll waits until it is put down (App.tsx `refresh`).
let carrying = 0;
export const isCarrying = () => carrying > 0;

type Held = {
  id: string; el: HTMLElement; scope: HTMLElement | null; scroller: HTMLElement | null;
  startY: number; scroll0: number; y: number; started: boolean;
  rows: { id: string; el: HTMLElement; top: number; bottom: number }[];
  from: number; to: number; frame: number;
};

const scrollerOf = (el: HTMLElement | null): HTMLElement | null => {
  for (let at = el?.parentElement ?? null; at; at = at.parentElement) {
    const o = getComputedStyle(at).overflowY;
    if ((o === 'auto' || o === 'scroll') && at.scrollHeight > at.clientHeight) return at;
  }
  return null;
};

/**
 * `onDrop(id, beforeId, drawn)` is called once, on letting go somewhere new;
 * beforeId is null at the foot of the list, and `drawn` is every row's id in
 * the order the person saw them, which is the order the place is worked out
 * against. Rows take part by carrying `data-drag-id`. A row inside a
 * `data-drag-scope` (a board column) moves among that scope's rows only;
 * anywhere else, among the whole list's.
 */
export function useRowDrag(onDrop: ((id: string, beforeId: string | null, drawn: string[]) => void) | undefined) {
  const listRef = useRef<HTMLDivElement>(null);
  const held = useRef<Held | null>(null);
  // The click that ends a drag must not also open the row. Cleared only once
  // the press is over, so Escape and then letting go does not open it either.
  const swallow = useRef(false);
  const dropNow = useRef(onDrop);
  dropNow.current = onDrop;

  // How far the list has scrolled since the lift. Every position is read in
  // the list's coordinates as they were at the lift, so a scroll moves the
  // pointer through the rows rather than the rows out from under it.
  const scrolled = (h: Held) => (h.scroller ? h.scroller.scrollTop - h.scroll0 : 0);
  // THE CARRIED ROW STAYS INSIDE ITS LIST, so it cannot be dragged off over the
  // header or below the last row and look lost.
  const carried = (h: Held) => {
    const me = h.rows[h.from];
    const first = h.rows[0];
    const last = h.rows[h.rows.length - 1];
    return Math.max(first.top - me.top, Math.min(last.bottom - me.bottom, h.y + scrolled(h) - h.startY));
  };
  const paint = (h: Held) => {
    const ds = scrolled(h);
    h.to = landingRow(h.rows, h.y + ds);
    h.el.style.transform = `translateY(${carried(h)}px)`;
    h.rows.forEach((r, i) => { if (i !== h.from) r.el.style.transform = `translateY(${shiftFor(i, h.from, h.to, pitchOf(h))}px)`; });
  };
  // How far the others move to open the slot: the carried row AND the gap
  // after it. Board cards have a gap between them and list rows do not; a
  // shift of the height alone left every card on the board 13px short of
  // where it then landed.
  const pitchOf = (h: Held) => {
    const me = h.rows[h.from];
    const next = h.rows[h.from + 1];
    const prev = h.rows[h.from - 1];
    if (next) return next.top - me.top;
    if (prev) return me.bottom - prev.bottom;
    return me.bottom - me.top;
  };
  // Near the edge of a scrolling list it scrolls, a frame at a time, for as
  // long as the pointer stays there.
  const tick = () => {
    const h = held.current;
    if (!h?.started) return;
    if (h.scroller) {
      const box = h.scroller.getBoundingClientRect();
      const by = edgeScroll(h.y, box.top, box.bottom);
      if (by) { h.scroller.scrollTop += by; paint(h); }
    }
    h.frame = requestAnimationFrame(tick);
  };

  // LETTING GO, WITHOUT A FLASH OF THE OLD ORDER (round two, 2026-10-07: "doesn't
  // feel that smooth"). The new order is drawn synchronously, inside the same
  // frame the transforms come off, and then every row that moved glides from
  // where it was on the screen to where it now is: the carried one settles
  // into its slot instead of snapping, and nothing else visibly jumps.
  const putDown = (keep: boolean) => {
    const h = held.current;
    held.current = null;
    if (!h?.started) return;
    carrying -= 1;
    cancelAnimationFrame(h.frame);
    swallow.current = true;
    const was = new Map(h.rows.map((r) => [r.id, r.el.getBoundingClientRect().top]));
    if (keep && !stays(h.from, h.to)) {
      const beforeId = h.rows[h.to]?.id ?? null;
      const drawn = h.rows.map((r) => r.id);
      flushSync(() => dropNow.current?.(h.id, beforeId, drawn));
    }
    // "settle" turns the rows' shift transition off, so taking the transforms
    // off below is instant, and keeps hover marks quiet until the glide ends.
    const scope = h.scope;
    if (scope) {
      scope.dataset.sorting = 'settle';
      setTimeout(() => { if (scope.dataset.sorting === 'settle') delete scope.dataset.sorting; }, SETTLE.duration + 20);
    }
    delete h.el.dataset.lifted;
    const els = [...(h.scope?.querySelectorAll<HTMLElement>('[data-drag-id]') ?? [])];
    for (const el of els) el.style.transform = '';
    for (const el of els) {
      const from = was.get(el.dataset.dragId!);
      if (from === undefined || !el.animate) continue;
      const by = from - el.getBoundingClientRect().top;
      const mine = el.dataset.dragId === h.id;
      if (Math.abs(by) < 0.5 && !mine) continue;
      if (mine) el.dataset.settling = '';
      const a = el.animate([{ transform: `translateY(${by}px)` }, { transform: 'none' }], SETTLE);
      if (mine) a.onfinish = a.oncancel = () => { delete el.dataset.settling; };
    }
  };

  const move = (y: number) => {
    const h = held.current;
    if (!h) return;
    h.y = y;
    if (!h.started) {
      // A press that barely moves is a click, not a lift.
      if (Math.abs(y - h.startY) < 4) return;
      const els = [...(h.scope?.querySelectorAll<HTMLElement>('[data-drag-id]') ?? [])];
      // A second lift straight after a drop would measure rows mid-glide.
      for (const el of els) { el.getAnimations?.().forEach((a) => a.finish()); delete el.dataset.settling; }
      h.rows = els.map((el) => { const b = el.getBoundingClientRect(); return { id: el.dataset.dragId!, el, top: b.top, bottom: b.bottom }; });
      h.from = h.rows.findIndex((r) => r.id === h.id);
      if (h.from < 0) { held.current = null; return; }
      h.started = true;
      carrying += 1;
      h.scroller = scrollerOf(h.scope);
      h.scroll0 = h.scroller?.scrollTop ?? 0;
      // No text selection under the pointer as the row lifts. Only now, at the
      // lift, so a plain click keeps every default it had.
      window.getSelection()?.removeAllRanges();
      if (h.scope) h.scope.dataset.sorting = 'carry';
      h.el.dataset.lifted = '';
      h.frame = requestAnimationFrame(tick);
    }
    paint(h);
  };

  // The listeners of the press in hand, so a lost window can take them off.
  const stopNow = useRef<(() => void) | null>(null);
  useEffect(() => {
    // While a row is in hand the keyboard does nothing but Escape: J, E, Tab
    // or B would move, close or unmount the very rows being carried over.
    const onKey = (e: KeyboardEvent) => {
      if (!held.current?.started) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') putDown(false);
    };
    // Switching away mid-drag puts it back and ends the press outright, so the
    // next click is an ordinary one.
    const onBlur = () => {
      if (!held.current) return;
      putDown(false);
      stopNow.current?.();
      swallow.current = false;
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('blur', onBlur); };
  }, []);

  const onPointerDown = (id: string, e: ReactPointerEvent<HTMLElement>) => {
    if (!dropNow.current || e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey) return;
    // The select box and the row's own buttons keep their press. A board
    // card is itself a button, and is the thing being carried.
    const hit = (e.target as HTMLElement).closest('button, a, input, textarea');
    if (hit && hit !== e.currentTarget) return;
    const el = e.currentTarget;
    const scope = el.closest<HTMLElement>('[data-drag-scope]') ?? listRef.current;
    held.current = { id, el, scope, scroller: null, startY: e.clientY, scroll0: 0, y: e.clientY, started: false, rows: [], from: -1, to: -1, frame: 0 };
    const onMove = (ev: PointerEvent) => move(ev.clientY);
    // The list scrolling under a still pointer moves the slot too.
    const onScroll = () => { const h = held.current; if (h?.started) paint(h); };
    const stop = () => {
      stopNow.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('scroll', onScroll, true);
      // The click this press makes comes after pointerup, in the same turn.
      setTimeout(() => { swallow.current = false; }, 0);
    };
    const up = () => { putDown(true); stop(); };
    const cancel = () => { putDown(false); stop(); };
    stopNow.current = stop;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('scroll', onScroll, true);
  };

  return {
    listRef, onPointerDown,
    swallowsClick: () => swallow.current,
    /** A row is in hand, so hover should not move: it would re-render the app per row crossed. */
    carrying: () => !!held.current?.started,
  };
}
