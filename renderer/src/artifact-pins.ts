// PURE. How the big file view (components/ArtifactView.tsx) draws its pins,
// zooms a picture, and what it offers for the file it found.
import { placeWords } from '../../shared/artifact-marks.mjs';
import { MAX_ZOOM } from './picture-view';
import type { FileNote, NotePlace } from './types';

export type Lean = 'ne' | 'nw' | 'se' | 'sw';

/** Room the tag needs beside its spot, in pixels: its offset and its own size. */
export const PIN_REACH = 44;

export function pinLean(spot: { x: number; y: number }, size: { w: number; h: number }, reach = PIN_REACH): Lean {
  if (!(size.w > 0 && size.h > 0)) return 'ne';
  const up = spot.y * size.h >= PIN_REACH;
  const right = (1 - spot.x) * size.w >= reach;
  return `${up ? 'n' : 's'}${right ? 'e' : 'w'}` as Lean;
}

/** "3" on its own version, "v1·3" for one carried from v1. */
export const pinLabel = (note: Pick<FileNote, 'pin' | 'from'>) => (note.from ? `${note.from}·${note.pin ?? 1}` : String(note.pin ?? 1));

/** A card's place, in the same words as the tag on the picture. */
export function notePlaceWords(note: Pick<FileNote, 'place' | 'pin' | 'from'>): string {
  if (note.place.kind === 'pin') return `Pin ${pinLabel(note)}`;
  return placeWords(pinned(note.place) ? { ...note, pin: pinLabel(note) } : note);
}

export interface DrawnPin { id: string; x: number; y: number; label: string; carried: boolean; on: boolean; settled: boolean }

/* ---------------------------------- films -------------------------------- */

export type FilmPin = DrawnPin & { s: number };
export type FilmMark = { id: string; s: number; on: boolean; pin: boolean };

/** A moment in a film that also names a place on its frame. */
export const hasSpot = (place: NotePlace | null | undefined): place is { kind: 'time'; s: number; x: number; y: number } =>
  place?.kind === 'time' && typeof place.x === 'number' && typeof place.y === 'number';

/** A page or slide that also names a place on it. */
export const pageSpot = (place: NotePlace | null | undefined): place is { kind: 'page'; n: number; word?: 'Slide'; x: number; y: number } =>
  place?.kind === 'page' && typeof place.x === 'number' && typeof place.y === 'number';

/** A comment on a spot, which is numbered and drawn as a pin. */
export const pinned = (place: NotePlace | null | undefined) => place?.kind === 'pin' || hasSpot(place) || pageSpot(place);

/** The pins on page or slide `n`. */
export function pagePins(own: FileNote[], carried: FileNote[], activeId: string | null, n: number, show: { resolved?: boolean; keep?: string | null } = {}): DrawnPin[] {
  const out: DrawnPin[] = [];
  for (const note of [...own, ...carried]) {
    if (!pageSpot(note.place) || note.place.n !== n) continue;
    if (note.resolved && note.id !== activeId && note.id !== show.keep && !show.resolved) continue;
    out.push({ id: note.id, x: note.place.x, y: note.place.y, label: pinLabel(note), carried: !!note.from, on: note.id === activeId, settled: !!note.resolved });
  }
  return out;
}

export function filmPins(own: FileNote[], carried: FileNote[], activeId: string | null, show: { resolved?: boolean; keep?: string | null } = {}): FilmPin[] {
  const out: FilmPin[] = [];
  for (const n of [...own, ...carried]) {
    if (!hasSpot(n.place) || (n.resolved && n.id !== activeId && n.id !== show.keep && !show.resolved)) continue;
    out.push({ id: n.id, s: n.place.s, x: n.place.x, y: n.place.y, label: pinLabel(n), carried: !!n.from, on: n.id === activeId, settled: !!n.resolved });
  }
  return out;
}

export function filmMarks(own: FileNote[], carried: FileNote[], activeId: string | null): FilmMark[] {
  return [...own, ...carried].flatMap((n) => (n.place.kind === 'time' && !n.resolved
    ? [{ id: n.id, s: n.place.s, on: n.id === activeId, pin: hasSpot(n.place) }] : []));
}

// Wide enough to see while playing, where the clock moves about four times a second.
export const PIN_FRAME_S = 0.3;

/** The pins on the frame showing at `now`. */
export const filmPinsAt = (pins: FilmPin[], now: number) => pins.filter((p) => Math.abs(p.s - now) < PIN_FRAME_S);

/**
 * A film nobody has started plays on a click, since that is what a click on a
 * film means; only a film someone stopped on a frame takes a pin.
 */
export function filmClickDoes({ paused, started, ended, canPin }: { paused: boolean; started: boolean; ended: boolean; canPin: boolean }): 'pin' | 'play' | 'pause' {
  if (!paused) return 'pause';
  return canPin && started && !ended ? 'pin' : 'play';
}

/** `keep` is a comment just resolved, whose pin stays, greyed, while its Undo is offered. */
export function pinsToDraw(own: FileNote[], carried: FileNote[], activeId: string | null, show: { resolved?: boolean; keep?: string | null } = {}): DrawnPin[] {
  const out: DrawnPin[] = [];
  for (const n of [...own, ...carried]) {
    if (n.place.kind !== 'pin') continue;
    if (n.resolved && n.id !== activeId && n.id !== show.keep && !show.resolved) continue;
    out.push({ id: n.id, x: n.place.x, y: n.place.y, label: pinLabel(n), carried: !!n.from, on: n.id === activeId, settled: !!n.resolved });
  }
  return out;
}

/* ---------------------------------- zoom --------------------------------- */

const STOPS = [1, 1.5, 2, 3, 4, 6, 8].filter((z) => z <= MAX_ZOOM);

/** `floor` is the zoom that shows the whole picture, below 1 when it opened fitted to its width. */
export function nextZoom(zoom: number, dir: 1 | -1, floor = 1): number {
  const stops = floor < 1 ? [floor, ...STOPS] : STOPS;
  if (dir > 0) return stops.find((z) => z > zoom + 0.01) ?? MAX_ZOOM;
  return [...stops].reverse().find((z) => z < zoom - 0.01) ?? Math.min(1, floor);
}

export function wheelZoom(zoom: number, deltaY: number, floor = 1): number {
  return Math.min(MAX_ZOOM, Math.max(Math.min(1, floor), zoom * Math.exp(-deltaY * 0.01)));
}

/**
 * The scroll that puts the same spot of the picture back under the pointer.
 * `f` is the spot as a fraction of the picture, `pointer` is where it is in the
 * box, `offset` is where the picture now starts in the box's content.
 */
export function keepUnder(f: { fx: number; fy: number }, pointer: { x: number; y: number }, offset: { left: number; top: number }, size: { w: number; h: number }) {
  return {
    left: Math.max(0, Math.round(offset.left + f.fx * size.w - pointer.x)),
    top: Math.max(0, Math.round(offset.top + f.fy * size.h - pointer.y)),
  };
}

export { pictureFit } from './picture-view';

/** The zoom that shows the picture's real pixels. */
export const realZoom = (fit: number) => (fit > 0 && fit < 1 ? Math.min(MAX_ZOOM, 1 / fit) : 1);

/**
 * What a zoom holds still: the pointer when a key is pressed with it over the
 * view; else the pin in hand where it is on screen, or in the middle when it is
 * out of view; with none, the middle. `pic` is the picture's box relative to the view.
 */
export function zoomAnchor(spot: { x: number; y: number } | null, view: { w: number; h: number }, pic: { left: number; top: number; w: number; h: number }, pointer?: { x: number; y: number } | null) {
  if (pointer && pointer.x >= 0 && pointer.x <= view.w && pointer.y >= 0 && pointer.y <= view.h) {
    return { fx: (pointer.x - pic.left) / (pic.w || 1), fy: (pointer.y - pic.top) / (pic.h || 1), ...pointer };
  }
  const mid = { x: view.w / 2, y: view.h / 2 };
  if (!spot) return { fx: (mid.x - pic.left) / (pic.w || 1), fy: (mid.y - pic.top) / (pic.h || 1), ...mid };
  const x = pic.left + spot.x * pic.w;
  const y = pic.top + spot.y * pic.h;
  const seen = x >= 0 && x <= view.w && y >= 0 && y <= view.h;
  return { fx: spot.x, fy: spot.y, ...(seen ? { x, y } : mid) };
}

/** The room a box leaves for its picture once its own padding is taken off. */
export function roomInside(box: { clientWidth: number; clientHeight: number; paddingLeft: string; paddingRight: string; paddingTop: string; paddingBottom: string }) {
  const px = (v: string) => parseFloat(v) || 0;
  return {
    w: Math.max(0, box.clientWidth - px(box.paddingLeft) - px(box.paddingRight)),
    h: Math.max(0, box.clientHeight - px(box.paddingTop) - px(box.paddingBottom)),
  };
}

/** The size against the picture's real pixels, as a design tool says it. */
export const zoomWords = (fit: number, zoom: number) => `${Math.round(fit * zoom * 100)}%`;

/* --------------------------------- the rest ------------------------------ */

export const stripFor = ({ fit, count }: { fit: boolean; landscape?: boolean; count: number }) => fit && count > 1;

/** How many open comments sit on each page or slide. */
export function marksOnPages(notes: Pick<FileNote, 'place' | 'resolved'>[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const n of notes) if (n.place.kind === 'page' && !n.resolved) out.set(n.place.n, (out.get(n.place.n) ?? 0) + 1);
  return out;
}

/** A script a thread names only counts once someone opened it or commented on it: most are just mentioned. */
export function otherFilesOpen<F extends { path: string }>(others: F[], opened: string | null | undefined, notes: Pick<FileNote, 'file'>[]): F[] {
  const clean = opened?.replace(/^\.\//, '');
  return others.filter((f) => f.path === clean || notes.some((n) => n.file === f.path.split('/').pop()));
}

const TILE_AIR = 16;
const TILE_WIDE = 0.84;

/** A page on a tile is whole and small, with air round it, never a white crop of its top. */
export function coverPageWidth(box: { w: number; h: number }, aspect: number): number {
  if (!(box.w > 0 && box.h > 0 && aspect > 0)) return 0;
  return Math.min(box.w * TILE_WIDE, (box.h - TILE_AIR) * aspect);
}

const MOST_A_CROP_MAY_LOSE = 0.4;

/** Fill the tile unless that would cut away too much of the picture to read it. */
export function coverFit(natural: { w: number; h: number }, box: { w: number; h: number }): 'cover' | 'contain' {
  if (!(natural.w > 0 && natural.h > 0 && box.w > 0 && box.h > 0)) return 'cover';
  const ratio = (natural.w / natural.h) / (box.w / box.h);
  const kept = ratio > 1 ? 1 / ratio : ratio;
  return 1 - kept > MOST_A_CROP_MAY_LOSE ? 'contain' : 'cover';
}

export type Found = 'looking' | 'open' | 'coming' | 'gone' | 'unplayable';

export function viewOffers(found: Found, signedIn: boolean): { approve: boolean; comment: boolean } {
  const open = found === 'open';
  return { approve: open && signedIn, comment: open };
}
