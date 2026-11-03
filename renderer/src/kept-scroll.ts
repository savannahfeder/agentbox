// WHERE AN OPEN FILE WAS LEFT, so reopening it, or opening its next version,
// lands there rather than at the top. Kept for as long as the window is open.
import { useLayoutEffect } from 'react';
import { baseName } from '../../shared/artifact-marks.mjs';

const kept = new Map<string, number>();

/** One file and all its versions: `designs/w-1/plan-v3.md` and `plan-v4.md` share a key. */
export function scrollKey(product: string, path: string): string {
  const cut = path.lastIndexOf('/') + 1;
  return `${product}\n${path.slice(0, cut)}${baseName(path.slice(cut))}`;
}

export function keepScroll(key: string, top: number): void {
  if (top > 0) kept.set(key, top); else kept.delete(key);
}

export const keptScroll = (key: string): number => kept.get(key) ?? 0;

// The words of a file often arrive after its box, so the box is too short to
// hold the place at first. It is put back each time the words grow, until the
// person moves it or this long has passed.
const SETTLES_MS = 1500;

/** Puts `box` back where this file was left and follows it from there. */
export function useKeptScroll(box: HTMLElement | null, key: string): void {
  // Before paint, so the file is not drawn at the top first.
  useLayoutEffect(() => {
    if (!box) return undefined;
    const want = keptScroll(key);
    let settling = want > 0;
    const put = () => { if (settling) box.scrollTop = want; };
    const settle = () => { settling = false; };
    put();
    const grows = new ResizeObserver(put);
    for (const child of Array.from(box.children)) grows.observe(child);
    const timer = window.setTimeout(settle, SETTLES_MS);
    const note = () => { if (!settling) keepScroll(key, box.scrollTop); };
    const hands = ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const;
    for (const h of hands) box.addEventListener(h, settle, { passive: true });
    box.addEventListener('scroll', note, { passive: true });
    return () => {
      grows.disconnect();
      window.clearTimeout(timer);
      for (const h of hands) box.removeEventListener(h, settle);
      box.removeEventListener('scroll', note);
    };
  }, [box, key]);
}
