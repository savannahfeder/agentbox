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
  startX: number; startY: number; scroll0: number; x: number; y: number; started: boolean;
  rows: { id: string; el: HTMLElement; top: number; bottom: number }[];
  from: number; to: number; frame: number;
  /** What rides the pointer, and where on it the pointer holds it. */
  preview: HTMLElement | null; gx: number; gy: number;
};

/** Where a row's empty slot sits, relative to where the row was: in front of
 *  row `to`, with the rows between closed up behind it. */
export function slotOffset(rows: { top: number; bottom: number }[], from: number, to: number): number {
  if (stays(from, to)) return 0;
  return to > from ? rows[to - 1].bottom - rows[from].bottom : rows[to].top - rows[from].top;
}

// ROUND FOUR (2026-10-07): "that looks a bit weird ... pretty unpolished ...
// make it a linear quality level", over two pictures: the whole row, 1,300px
// wide, sliding off the panel's edge and over the column headings, and a
// board card dropped half over the selected one. Carrying the row ITSELF was
// the mistake. So the row stays in the list as its own empty slot, which
// moves to where it will land, and what rides the pointer is a separate
// PREVIEW drawn over everything: on the list a compact chip (the title and the
// project), on the board a copy of the card. It cannot be clipped, cannot
// cover the headings with a wall of row, and letting go flies it into the
// slot.
//
// NO DRAG DOTS ANYWHERE (round five, 2026-10-07): "the drag icon is too much
// and causes too many problems. Let's just get rid of it entirely: no drag
// icon on hover or in general, even when you're dragging." Not on a row, not
// on a card, not on the chip.
//
// The chip's title starts this far in from its own left edge (its padding,
// pages.css `.drag-chip`). The list's titles start at 32px, so a chip lands
// this much to the right of its row and the two titles meet.
const CHIP_INSET = 16;
const LIST_TEXT_X = 32;
function chipOf(row: HTMLElement): HTMLElement {
  const chip = document.createElement('div');
  chip.className = 'drag-preview drag-chip';
  const title = document.createElement('span');
  title.className = 't';
  title.textContent = (row.querySelector('.th-cell-title .th-msg-text, .th-cell-title') as HTMLElement | null)?.textContent?.trim() ?? '';
  const project = document.createElement('span');
  project.className = 'p';
  project.textContent = row.querySelector('.th-cell-proj')?.textContent?.trim() ?? '';
  chip.append(title, project);
  return chip;
}

function copyOf(card: HTMLElement): HTMLElement {
  const copy = card.cloneNode(true) as HTMLElement;
  for (const a of ['data-drag-id', 'data-lifted', 'data-settling']) copy.removeAttribute(a);
  copy.classList.remove('selected');
  copy.classList.add('drag-preview');
  copy.style.width = `${card.getBoundingClientRect().width}px`;
  return copy;
}

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
export function useRowDrag(
  onDrop: ((id: string, beforeId: string | null, drawn: string[]) => void) | undefined,
  /** 'chip' for the list's wide rows, 'copy' for the board's cards. */
  look: 'chip' | 'copy' = 'chip',
) {
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
  // THE PREVIEW GOES WHERE THE HAND GOES, both ways (round three: "I expect it
  // to drag left to right ... completely locked in"). Only up and down picks
  // the place; the slot shows it.
  const paint = (h: Held) => {
    const ds = scrolled(h);
    h.to = landingRow(h.rows, h.y + ds);
    if (h.preview) h.preview.style.transform = `translate(${h.x - h.gx}px, ${h.y - h.gy}px)`;
    h.el.style.transform = `translateY(${slotOffset(h.rows, h.from, h.to)}px)`;
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
    const was = new Map(h.rows.map((r) => { const b = r.el.getBoundingClientRect(); return [r.id, { top: b.top, left: b.left }]; }));
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
    delete document.body.dataset.dragging;
    const els = [...(h.scope?.querySelectorAll<HTMLElement>('[data-drag-id]') ?? [])];
    for (const el of els) el.style.transform = '';
    // The others close up from wherever they were drawn. The row's own slot
    // is already where it lands, so it barely moves.
    for (const el of els) {
      const from = was.get(el.dataset.dragId!);
      if (from === undefined || !el.animate) continue;
      const now = el.getBoundingClientRect();
      const by = from.top - now.top;
      if (Math.abs(by) < 0.5) continue;
      el.animate([{ transform: `translateY(${by}px)` }, { transform: 'none' }], SETTLE);
    }
    // THE PREVIEW FLIES INTO THE SLOT and fades as it arrives, while the
    // row's own words come back underneath it: one object landing, not a
    // chip vanishing and a row appearing.
    const mine = h.el.isConnected ? h.el : els.find((el) => el.dataset.dragId === h.id) ?? null;
    const preview = h.preview;
    if (mine) {
      delete mine.dataset.lifted;
      mine.dataset.settling = '';
    }
    if (!preview) { if (mine) delete mine.dataset.settling; return; }
    const at = preview.getBoundingClientRect();
    const end = mine?.getBoundingClientRect();
    // A card copy lands on its card; a chip lands with its title on the row's.
    const tx = end ? end.left + (look === 'chip' ? LIST_TEXT_X - CHIP_INSET : 0) : at.left;
    // A chip's title lands on the row's title line (19px of row padding over
    // a 20px line); a card copy lands on the card.
    const ty = end ? (look === 'chip' ? end.top + 29 - at.height / 2 : end.top) : at.top;
    const done = () => { preview.remove(); if (mine) delete mine.dataset.settling; };
    if (!preview.animate) { done(); return; }
    const a = preview.animate([
      { transform: `translate(${at.left}px, ${at.top}px)`, opacity: 1 },
      { transform: `translate(${tx}px, ${ty}px)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${tx}px, ${ty}px)`, opacity: 0 },
    ], { duration: 240, easing: SETTLE.easing, fill: 'forwards' });
    a.onfinish = a.oncancel = done;
  };

  const move = (x: number, y: number) => {
    const h = held.current;
    if (!h) return;
    h.x = x;
    h.y = y;
    if (!h.started) {
      // A press that barely moves is a click, not a lift.
      if (Math.hypot(x - h.startX, y - h.startY) < 4) return;
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
      document.body.dataset.dragging = '';
      // The preview, held where the pointer took it: a card copy at the very
      // spot it was grabbed, a chip with the pointer where its title starts.
      const box = h.el.getBoundingClientRect();
      const preview = look === 'copy' ? copyOf(h.el) : chipOf(h.el);
      document.body.appendChild(preview);
      h.preview = preview;
      if (look === 'copy') { h.gx = h.startX - box.left; h.gy = h.startY - box.top; }
      else { h.gx = CHIP_INSET; h.gy = preview.getBoundingClientRect().height / 2; }
      preview.animate?.([{ opacity: 0, scale: '0.97' }, { opacity: 1, scale: '1' }], { duration: 140, easing: SETTLE.easing });
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
    held.current = { id, el, scope, scroller: null, startX: e.clientX, startY: e.clientY, scroll0: 0, x: e.clientX, y: e.clientY, started: false, rows: [], from: -1, to: -1, frame: 0, preview: null, gx: 0, gy: 0 };
    const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
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
