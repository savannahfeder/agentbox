// DRAGGING A THREAD UP OR DOWN THE LIST (w-6e5b532a95, 2026-10-07): "I'd
// rather be able to drag things around here, move them around, and have that
// priority remembered and that's how the app processes it."
//
// The row is lifted and rides the pointer; the rows it passes slide aside to
// open its new slot; letting go hands the row and the one it now sits in front
// of to the caller, which works out the place (`dropPlaces`, shared/rank.mjs).
// Escape puts it back. Pointer events and the whole window listening until the
// press ends, the way the board's columns are carried (Pages.tsx), because
// the browser's own drag and drop draws a ghost and cancels when the list
// redraws under it.
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { landingRow } from '../project-priority';

/** How far a row passed by the drag moves to open the slot: up or down one
 *  row's height, or not at all. `to` is the row it lands in front of. */
export function shiftFor(i: number, from: number, to: number, height: number): number {
  if (from < i && i < to) return -height;
  if (to <= i && i < from) return height;
  return 0;
}

/** Whether a drop from `from` in front of `to` would leave the row where it was. */
export const stays = (from: number, to: number) => to === from || to === from + 1;

type Held = {
  id: string; el: HTMLElement; startY: number; started: boolean;
  rows: { id: string; el: HTMLElement; top: number; bottom: number }[];
  from: number; to: number;
};

/**
 * `onDrop(id, beforeId)` is called once, on letting go somewhere new; beforeId
 * is null at the foot of the list. Rows take part by carrying `data-drag-id`.
 */
export function useRowDrag(onDrop: ((id: string, beforeId: string | null) => void) | undefined) {
  const listRef = useRef<HTMLDivElement>(null);
  const held = useRef<Held | null>(null);
  // The click that ends a drag must not also open the row.
  const justDropped = useRef(false);
  const dropNow = useRef(onDrop);
  dropNow.current = onDrop;

  const paint = (h: Held, y: number) => {
    h.el.style.transform = `translateY(${y - h.startY}px)`;
    const height = h.rows[h.from].bottom - h.rows[h.from].top;
    h.rows.forEach((r, i) => { if (i !== h.from) r.el.style.transform = `translateY(${shiftFor(i, h.from, h.to, height)}px)`; });
  };
  const putDown = (keep: boolean) => {
    const h = held.current;
    held.current = null;
    if (!h?.started) return;
    for (const r of h.rows) r.el.style.transform = '';
    listRef.current?.classList.remove('th-sorting');
    h.el.classList.remove('th-row-lifted');
    justDropped.current = true;
    setTimeout(() => { justDropped.current = false; }, 0);
    if (keep && !stays(h.from, h.to)) dropNow.current?.(h.id, h.rows[h.to]?.id ?? null);
  };

  const move = (y: number) => {
    const h = held.current;
    if (!h) return;
    if (!h.started) {
      // A press that barely moves is a click, not a lift.
      if (Math.abs(y - h.startY) < 4) return;
      const els = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-drag-id]') ?? [])];
      h.rows = els.map((el) => { const b = el.getBoundingClientRect(); return { id: el.dataset.dragId!, el, top: b.top, bottom: b.bottom }; });
      h.from = h.rows.findIndex((r) => r.id === h.id);
      if (h.from < 0) { held.current = null; return; }
      h.started = true;
      listRef.current?.classList.add('th-sorting');
      h.el.classList.add('th-row-lifted');
    }
    h.to = landingRow(h.rows, y);
    paint(h, y);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !held.current?.started) return;
      e.preventDefault(); e.stopPropagation();
      putDown(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const onPointerDown = (id: string, e: ReactPointerEvent<HTMLElement>) => {
    if (!dropNow.current || e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey) return;
    // The select box and the row's own buttons keep their press.
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
    held.current = { id, el: e.currentTarget, startY: e.clientY, started: false, rows: [], from: -1, to: -1 };
    const onMove = (ev: PointerEvent) => move(ev.clientY);
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const up = () => { stop(); putDown(true); };
    const cancel = () => { stop(); putDown(false); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  return { listRef, onPointerDown, swallowsClick: () => justDropped.current };
}
