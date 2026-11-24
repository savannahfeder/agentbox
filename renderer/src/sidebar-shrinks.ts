// Whether the sidebar folds to icons when the pointer leaves it. On unless a
// person chose to keep it open; kept on this computer.
import { useSyncExternalStore } from 'react';

export const SIDEBAR_SHRINKS_KEY = 'agentbox.sidebarShrinks';

export const sidebarFolded = ({ phone, shrinks, pointedAt }: { phone: boolean; shrinks: boolean; pointedAt: boolean }) =>
  phone || (shrinks && !pointedAt);

/** A sidebar drawn under a resting pointer is told the pointer entered it; only one that moved opens it. */
export const pointerMoved = (e: { movementX: number; movementY: number }) => e.movementX !== 0 || e.movementY !== 0;

type At = { x: number; y: number };
type Box = { left: number; top: number; right: number; bottom: number };
const OUT_OF_THE_WINDOW: At = { x: -Infinity, y: -Infinity };

/** Whether the pointer was outside the sidebar before this move. A sidebar that
 *  slid under the pointer (the walkthrough's column coming or going) gets nudged,
 *  not entered, and stays shut. Nothing seen yet counts as not crossed. */
export const crossedIn = (from: At | null, box: Box) =>
  !!from && (from.x < box.left || from.x >= box.right || from.y < box.top || from.y >= box.bottom);

/** Where the pointer was one move ago. */
export function pointerTrail() {
  let before: At | null = null;
  let now: At | null = null;
  return {
    moved(x: number, y: number) { before = now; now = { x, y }; },
    left() { now = OUT_OF_THE_WINDOW; },
    before: () => before,
  };
}

/** Feeds a trail from the window, ahead of any handler that could stop the event. */
export function followPointer(win: Window, trail: ReturnType<typeof pointerTrail>) {
  const moved = (e: MouseEvent) => trail.moved(e.clientX, e.clientY);
  const out = (e: MouseEvent) => { if (!e.relatedTarget) trail.left(); };
  win.addEventListener('mousemove', moved, true);
  win.addEventListener('mouseout', out, true);
  return () => { win.removeEventListener('mousemove', moved, true); win.removeEventListener('mouseout', out, true); };
}

export const shrinksFrom =(stored: string | null) => stored !== '0';

const heard = new Set<() => void>();
const read = () => {
  try { return shrinksFrom(localStorage.getItem(SIDEBAR_SHRINKS_KEY)); } catch { return true; }
};

export function setSidebarShrinks(on: boolean) {
  try { localStorage.setItem(SIDEBAR_SHRINKS_KEY, on ? '1' : '0'); } catch { /* it just does not stick */ }
  for (const fn of heard) fn();
}

/** Flips it, and answers whether the sidebar folds now. */
export function toggleSidebarShrinks(): boolean {
  const next = !read();
  setSidebarShrinks(next);
  return next;
}

export function useSidebarShrinks(): boolean {
  return useSyncExternalStore((fn) => { heard.add(fn); return () => heard.delete(fn); }, read);
}
