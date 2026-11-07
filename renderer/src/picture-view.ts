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

// Fitted by its height, a picture narrower than this share of the box is a strip nobody can read.
const STRIP = 0.6;
// A phone screenshot, 16:9 to 19.5:9 with room for a status bar. Longer is a scrolled page.
const PHONE_SHORTEST = 1.6;
const PHONE_TALLEST = 2.4;
// Drawn this wide, a phone screen's words are near their own size.
const PHONE_READABLE_PX = 300;

/**
 * The scale a picture opens at, and the scale that shows all of it. A tall one
 * fits the width and scrolls, never past its real pixels, unless it is a phone
 * screen that reads whole.
 */
export function pictureFit(natural: { w: number; h: number }, box: { w: number; h: number }): { scale: number; tall: boolean; whole: number } {
  if (!(natural.w > 0 && natural.h > 0 && box.w > 0 && box.h > 0)) return { scale: 1, tall: false, whole: 1 };
  const byWidth = Math.min(1, box.w / natural.w);
  const whole = Math.min(byWidth, box.h / natural.h);
  const drawn = natural.w * whole;
  const aspect = natural.h / natural.w;
  const phone = aspect >= PHONE_SHORTEST && aspect <= PHONE_TALLEST && drawn >= Math.min(natural.w, PHONE_READABLE_PX);
  const tall = natural.h * byWidth > box.h && drawn < STRIP * box.w && !phone;
  return { scale: tall ? byWidth : whole, tall, whole };
}

/** The zoom, counted from the opening scale, that shows the whole picture. */
export const lowestZoom = (fit: { scale: number; whole: number }) => (fit.scale > 0 ? Math.min(1, fit.whole / fit.scale) : 1);

/** How far a picture drawn at `size` times `zoom` may move from the middle of the box. */
export function panLimits(size: { w: number; h: number }, zoom: number, box: { w: number; h: number }) {
  return { x: Math.max(0, (size.w * zoom - box.w) / 2), y: Math.max(0, (size.h * zoom - box.h) / 2) };
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

export function zoomBy(zoom: number, factor: number, floor = 1): number {
  return Math.min(MAX_ZOOM, Math.max(Math.min(1, floor), zoom * factor));
}

export function stepTo(index: number, count: number, by: number): number {
  return Math.max(0, Math.min(count - 1, index + by));
}

type Point = { x: number; y: number };

/**
 * The zoom and pan two fingers ask for. The point that was under the fingers
 * when the pinch began stays under them as they spread and move together.
 * Points are offsets from the middle of the stage.
 */
export function pinchTo(start: { distance: number; zoom: number; pan: Point; mid: Point }, distance: number, mid: Point, floor = 1) {
  const zoom = start.distance > 0 ? zoomBy(start.zoom, distance / start.distance, floor) : start.zoom;
  const kept = panToKeep(start.mid, start.pan, start.zoom, zoom);
  return { zoom, pan: { x: kept.x + mid.x - start.mid.x, y: kept.y + mid.y - start.mid.y } };
}

/** A finger dragged sideways across a fitted picture: 1 for the next one, -1 for the one before, 0 for neither. */
export function swipeStep(dx: number, dy: number): number {
  if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.6) return 0;
  return dx < 0 ? 1 : -1;
}

/** Is this tap the second of a double tap? */
export function isDoubleTap(last: { t: number; x: number; y: number } | null, now: { t: number; x: number; y: number }): boolean {
  return !!last && now.t - last.t < 300 && Math.hypot(now.x - last.x, now.y - last.y) < 40;
}
