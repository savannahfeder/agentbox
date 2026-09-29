// A COMPOSER MENU NEVER HANGS OFF THE WINDOW.
//
// Every drawer in the composer's sentence opens in one fixed direction, set in
// CSS: down from the new-task card, up from the reply dock. That was chosen for
// a card near the top of a 900px window. With the card in the middle of the
// screen and the app zoomed in, the model drawer dropped straight past the
// bottom edge and cut its Effort row in half, so High could barely be pressed
// and Extra and Max could not be reached at all (w-12730c6506, 2026-09-25).
//
// So once a drawer is open it is measured. If it fits where CSS put it, nothing
// changes. If it does not, it opens on whichever side of its word has more
// room, and if even that side is too short it scrolls inside itself rather than
// leaving anything outside the window.
//
// SIDEWAYS TOO. The model drawer hangs leftward from its word, which assumed
// the word ends the footer's line. With a file open beside the card the reply
// dock narrows, the footer wraps, "On Opus 5.5." starts the second line, and
// the drawer ran out past the conversation pane's left edge, where the pane
// clips it: the model rows and Low and Medium were cut off (w-a29fae865a,
// 2026-09-25). So a drawer that leaves the visible strip, the window narrowed
// by every ancestor that clips, slides back inside it.
import { useLayoutEffect, type RefObject } from 'react';

const EDGE = 8; // kept clear between a menu and the window's edge
const GAP = 8; // between the word and its menu, the same as the CSS

export type Sides = { left: number; right: number };

/** Where a menu hung from `el` can be seen side to side: the window, narrowed by every ancestor that clips. */
export function visibleSides(el: Element | null): Sides {
  let left = 0;
  let right = window.innerWidth;
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (getComputedStyle(n).overflowX === 'visible') continue;
    const r = n.getBoundingClientRect();
    left = Math.max(left, r.left);
    right = Math.min(right, r.right);
  }
  return { left, right };
}

export function fitMenu(menu: HTMLElement, room = window.innerHeight, sides?: Sides): void {
  const s = menu.style;
  s.top = s.bottom = s.maxHeight = s.overflowY = s.left = s.right = '';
  const box = menu.getBoundingClientRect();
  const anchor = menu.parentElement?.getBoundingClientRect();
  if (!anchor) return;
  const across = sides ?? visibleSides(menu.parentElement);
  if (box.left < across.left + EDGE || box.right > across.right - EDGE) {
    const left = Math.max(across.left + EDGE, Math.min(box.left, across.right - EDGE - box.width));
    s.left = `${Math.round(left - anchor.left)}px`;
    s.right = 'auto';
  }
  if (box.top >= EDGE && box.bottom <= room - EDGE) return;
  const below = room - anchor.bottom - GAP - EDGE;
  const above = anchor.top - GAP - EDGE;
  const tall = box.height;
  const down = below >= tall || (above < tall && below >= above);
  if (down) { s.top = `calc(100% + ${GAP}px)`; s.bottom = 'auto'; }
  else { s.top = 'auto'; s.bottom = `calc(100% + ${GAP}px)`; }
  const space = Math.floor(down ? below : above);
  if (tall > space) { s.maxHeight = `${Math.max(space, 96)}px`; s.overflowY = 'auto'; }
}

/** Fit the menu drawn directly inside `wrap` while `open`, and again on resize or zoom. */
export function useKeepInWindow(wrap: RefObject<HTMLElement | null>, open: boolean, deps: unknown[] = []): void {
  useLayoutEffect(() => {
    if (!open) return undefined;
    const menu = wrap.current?.querySelector<HTMLElement>(':scope > .prio-menu, :scope > .when-menu');
    if (!menu) return undefined;
    const fit = () => fitMenu(menu);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [open, ...deps]);
}
