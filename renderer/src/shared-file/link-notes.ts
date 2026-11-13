// PURE. Comments on a shared file's page, placed the way notes are in the app:
// a moment in a film and a spot on its frame, a spot on a picture, words in a
// document (shared/artifact-marks.mts NotePlace).
import { placeWords, type NotePlace } from '../../../shared/artifact-marks.mts';
import type { DrawnPin, FilmMark, FilmPin } from '../artifact-pins';

export interface Placed { id: string; place?: NotePlace }

const spotted = (p: NotePlace | undefined): p is NotePlace & { x: number; y: number } =>
  (p?.kind === 'pin' || p?.kind === 'time' || p?.kind === 'page') && typeof p.x === 'number' && typeof p.y === 'number';

/** Each comment with a spot gets the next number, oldest first, as pins do in the app. */
export function pinNumbers(comments: readonly Placed[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of comments) if (spotted(c.place)) out.set(c.id, String(out.size + 1));
  return out;
}

/** The words on a comment's place: "0:24", "Pin 2 at 0:31", "Pin 1", the quote. Null on the whole file. */
export function placeLabel(c: Placed, numbers: Map<string, string>): string | null {
  if (!c.place || c.place.kind === 'whole') return null;
  return placeWords({ place: c.place, pin: numbers.get(c.id) });
}

const blank = { carried: false, settled: false };

export function filmMarks(comments: readonly Placed[], chosen: string | null): FilmMark[] {
  return comments.flatMap((c) => (c.place?.kind === 'time' ? [{ id: c.id, s: c.place.s, on: c.id === chosen, pin: spotted(c.place) }] : []));
}

export function filmPins(comments: readonly Placed[], chosen: string | null): FilmPin[] {
  const n = pinNumbers(comments);
  return comments.flatMap((c) => (c.place?.kind === 'time' && spotted(c.place) ? [{ id: c.id, s: c.place.s, x: c.place.x, y: c.place.y, label: n.get(c.id)!, on: c.id === chosen, ...blank }] : []));
}

export function picturePins(comments: readonly Placed[], chosen: string | null): DrawnPin[] {
  const n = pinNumbers(comments);
  return comments.flatMap((c) => (c.place?.kind === 'pin' ? [{ id: c.id, x: c.place.x, y: c.place.y, label: n.get(c.id)!, on: c.id === chosen, ...blank }] : []));
}

const clock = (s: number) => { const w = Math.floor(Math.max(0, s)); return `${Math.floor(w / 60)}:${String(w % 60).padStart(2, '0')}`; };

export type FileKindHere = 'film' | 'picture' | 'words' | 'other';

/**
 * Where the comment being written goes. A film's goes on the moment it shows
 * unless its writer took that off; a picture's and a document's only where
 * they pointed.
 */
export function placeToSend(kind: FileKindHere, draft: NotePlace | null, filmNow: number, wholeFilm: boolean): NotePlace | null {
  if (draft) return draft;
  if (kind === 'film' && !wholeFilm) return { kind: 'time', s: Math.round(Math.max(0, filmNow) * 10) / 10 };
  return null;
}

/** The words over the box: where the comment goes, or how to point at a place. */
export function draftWords(kind: FileKindHere, place: NotePlace | null): string {
  if (place?.kind === 'time') return typeof place.x === 'number' ? `Pin at ${clock(place.s)}` : `At ${clock(place.s)}`;
  if (place?.kind === 'pin') return 'Pin on the picture';
  if (place?.kind === 'quote') return `On “${place.text.length > 60 ? `${place.text.slice(0, 59).trimEnd()}…` : place.text}”`;
  if (kind === 'film') return 'On the whole film';
  if (kind === 'picture') return 'Click the picture to pin a spot';
  if (kind === 'words') return 'Select words to comment on them';
  return 'On the whole file';
}

/** Words picked in the document, as a quote a comment can hang on; null for none or too few. */
export function quoteOf(selected: string): NotePlace | null {
  const text = selected.replace(/\s+/g, ' ').trim();
  if (text.length < 2) return null;
  return { kind: 'quote', text: text.length > 500 ? text.slice(0, 500) : text };
}
