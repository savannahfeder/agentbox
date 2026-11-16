import { useLayoutEffect, type RefObject } from 'react';

/** What Home's box hides when its controls do not fit on one line, least needed
 *  first. The project, who sees it, and Send are never hidden. */
export const DROP_ORDER = ['priority', 'send-keys', 'model', 'to', 'attach'] as const;
export type Droppable = typeof DROP_ORDER[number];
export const dropRank = (name: Droppable) => DROP_ORDER.indexOf(name) + 1;

interface Part { getAttribute(name: string): string | null; setAttribute(name: string, value: string): void; removeAttribute(name: string): void }
interface Row { readonly scrollWidth: number; readonly clientWidth: number; querySelectorAll(selector: string): ArrayLike<Part> }

/** Shows every part, then hides by rank until the row fits. Returns how many it hid. */
export function fitRow(row: Row): number {
  const parts = Array.from(row.querySelectorAll('[data-drop]'))
    .sort((a, b) => Number(a.getAttribute('data-drop')) - Number(b.getAttribute('data-drop')));
  for (const p of parts) p.removeAttribute('data-dropped');
  let hid = 0;
  for (const p of parts) {
    if (row.scrollWidth <= row.clientWidth) break;
    p.setAttribute('data-dropped', '');
    hid++;
  }
  return hid;
}

/** Fits the row after every render and whenever its width changes. */
export function useFitRow(ref: RefObject<HTMLElement | null>, on: boolean) {
  useLayoutEffect(() => { if (on && ref.current) fitRow(ref.current); });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => fitRow(el));
    watch.observe(el);
    return () => watch.disconnect();
  }, [on, ref]);
}
