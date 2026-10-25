// PURE. The picture that opens large over the thread (PictureView.tsx): which
// clicks open it, how big it is drawn, and how it zooms and steps.
import { docKind } from './doc-pane';

/** Zoom is counted from the fitted size, so 1 is "all of it on screen". */
export const MAX_ZOOM = 8;

/** How long a picture may take to read before the view says it could not. */
export const PICTURE_WAIT_MS = 12_000;

export type Picture = { path: string; url: string | null };

/** A picture drawn in the thread: the path its click opens, the url it loaded from, and its part (../her-turns.ts). */
export type Shot = Picture & { section: string | null };

// One file drawn twice, by a relative path and by a full one or with a
// look-again query, is one picture.
const fileOf = (s: Shot) => (s.url ?? s.path).replace(/[?#].*$/, '');

/**
 * The pictures stepped through from the one at `at`: those in its own part of
 * the thread, in reading order, each file once, with the clicked one open.
 */
export function picturesBeside(shots: Shot[], at: number): { pictures: Picture[]; start: number } {
  const here = shots[at];
  if (!here) return { pictures: [], start: 0 };
  const seen = new Map<string, number>();
  const pictures: Picture[] = [];
  for (const s of shots) {
    if (s.section !== here.section || seen.has(fileOf(s))) continue;
    seen.set(fileOf(s), pictures.length);
    pictures.push({ path: s.path, url: s.url });
  }
  return { pictures, start: seen.get(fileOf(here)) ?? 0 };
}

/** The pictures to read ahead of a step: the next one first, then the one before. */
export function readyAround(index: number, count: number): number[] {
  return [index + 1, index - 1].filter((i) => i >= 0 && i < count && i !== index);
}

export function opensAsPicture(path: string | undefined | null): boolean {
  return docKind(path) === 'image';
}

/** The scale that shows the whole picture in the box. Never above 1, which would blur it. */
export function fitScale(natural: { w: number; h: number }, box: { w: number; h: number }): number {
  if (!(natural.w > 0 && natural.h > 0)) return 1;
  return Math.min(1, box.w / natural.w, box.h / natural.h);
}

/**
 * Where a click takes the zoom. From fitted it goes to the picture's real
 * pixels, which is what a screenshot is opened for; a picture already shown at
 * its real size has nothing to gain from that, so it doubles.
 */
export function clickZoom(zoom: number, fit: number): number {
  if (zoom > 1.01) return 1;
  const real = fit > 0 ? 1 / fit : 2;
  return real > 1.25 ? Math.min(MAX_ZOOM, real) : 2;
}

/**
 * The pan that keeps the point under the pointer still while the zoom changes.
 * `at` is the pointer's offset from the middle of the stage, where the picture's
 * transform is anchored.
 */
export function panToKeep(at: { x: number; y: number }, pan: { x: number; y: number }, zoom: number, next: number) {
  const k = next / zoom;
  return { x: at.x - (at.x - pan.x) * k, y: at.y - (at.y - pan.y) * k };
}

export function zoomBy(zoom: number, factor: number): number {
  return Math.min(MAX_ZOOM, Math.max(1, zoom * factor));
}

export function stepTo(index: number, count: number, by: number): number {
  return Math.max(0, Math.min(count - 1, index + by));
}
