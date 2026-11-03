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

/** Puts `box` back where this file was left and follows it from there. */
export function useKeptScroll(box: HTMLElement | null, key: string): void {
  // Before paint, so the file is never drawn at the top first.
  useLayoutEffect(() => {
    if (!box) return undefined;
    box.scrollTop = keptScroll(key);
    const note = () => keepScroll(key, box.scrollTop);
    box.addEventListener('scroll', note, { passive: true });
    return () => box.removeEventListener('scroll', note);
  }, [box, key]);
}
