// Whether the sidebar folds to icons when the pointer leaves it. On unless a
// person chose to keep it open; kept on this computer.
import { useSyncExternalStore } from 'react';

export const SIDEBAR_SHRINKS_KEY = 'agentbox.sidebarShrinks';

export const sidebarFolded = ({ phone, shrinks, pointedAt }: { phone: boolean; shrinks: boolean; pointedAt: boolean }) =>
  phone || (shrinks && !pointedAt);

/** A sidebar drawn under a resting pointer is told the pointer entered it; only one that moved opens it. */
export const pointerMoved = (e: { movementX: number; movementY: number }) => e.movementX !== 0 || e.movementY !== 0;

/** How long the pointer rests on the closed sidebar before it opens, and how long after leaving before it closes. */
export const OPENS_AFTER_MS = 140;
export const CLOSES_AFTER_MS = 300;

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
