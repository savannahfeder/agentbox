// PURE. WHERE SHE WAS WHEN THE PAGE RELOADED, and what it takes to put her
// back there.
//
// ⌘R throws the whole renderer away and builds it again, so every piece of
// where she was lived in React state and died with it: the tab, the open task,
// the row the cursor was on. The page came back on the inbox because that is
// what `useState` was given, not because anything decided it should.
//
// So the app writes down where it is, on every move, and reads it back on the
// way in. Two rules hold the shape of what is written:
//
//   IDENTITY, NOT OBJECTS. A task is stored as its product and its id, never as
//   the row itself. The reload re-reads the store, and the row that comes back
//   is newer than the one she was looking at: an agent may have written a
//   checkpoint in the meantime, and she should get the new words, not a copy of
//   the old ones frozen into localStorage.
//
//   A PLACE IS NOT A DRAFT. Nothing she was in the middle of TYPING is in here.
//   Her unsent words already survive a reload on their own (see drafts.ts), and
//   the reply box reopens itself when the task it belongs to has one, so a
//   place that also tried to remember open boxes would fight the module that
//   already does it properly.
//
// ONLY A RELOAD RESTORES. Opening Agentbox in the morning still opens on the
// inbox, which is the whole design of the app and the reason the idle screen
// and the first run have anywhere to be. The main process already knows the
// difference and has always said so: `bootInfo.reloaded` is true only after the
// ⌘R it was pressed for. That flag is the gate.

import type { View } from './types';

const KEY = 'zero.where';

const VIEWS: readonly View[] = ['inbox', 'snoozed', 'progress', 'done'];

export interface Place {
  // The tab under the list. Always present: it is the coarsest answer to
  // "which page", and the one that is right even when nothing was open.
  view: View;
  // The task she had open full screen, if any.
  item?: { product: string; id: string };
  // HOW FAR DOWN THAT TASK SHE WAS.Clicking into a task lands at the end of the
  // conversation and always will; this number is read back by the ⌘R restore
  // and by nothing else, which is what makes those two answers able to coexist.
  // It belongs to `item` and is meaningless without it.
  scroll?: number;
  // Or the repeating rule, which is the same full screen wearing another card.
  repeat?: { product: string; id: string };
  // The document open beside the task. Stored because the pane can be one she
  // chose, and a card that opens a different document on its own would be the
  // app overruling her (App.tsx opens the first document a card names, which is
  // right on arrival and wrong on a reload).
  doc?: { product: string; src: string };
  // The Settings screen, which is a screen rather than a modal and so is a
  // place she can be reloaded out of.
  settings?: boolean;
  // What she had typed into the search field. '' is the field open and empty,
  // undefined is not searching, which is the same two states App.tsx keeps.
  search?: string;
  // The row the keyboard was on, by id rather than by index: the list is rebuilt
  // from a fresh snapshot and row four may not be the same row any more.
  row?: string;
}

// Anything at all can be in localStorage, including a place written by a build
// that spelled a view differently. Every field is checked, and one bad field
// costs only itself: a place naming a view this build does not have is not a
// reason to lose the task she had open.
export function readPlace(storage: Pick<Storage, 'getItem'>): Place | null {
  let raw: unknown;
  try { raw = JSON.parse(storage.getItem(KEY) ?? 'null'); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const view = VIEWS.includes(p.view as View) ? (p.view as View) : 'inbox';
  const place: Place = { view };
  const ref = (v: unknown) => {
    if (!v || typeof v !== 'object') return undefined;
    const r = v as Record<string, unknown>;
    if (typeof r.product !== 'string' || typeof r.id !== 'string') return undefined;
    if (!r.product || !r.id) return undefined;
    return { product: r.product, id: r.id };
  };
  const item = ref(p.item);
  if (item) place.item = item;
  // Only with the task it belongs to, and only as a real number: a scroll
  // position restored onto a different task is worse than none.
  if (item && typeof p.scroll === 'number' && Number.isFinite(p.scroll) && p.scroll > 0) {
    place.scroll = Math.round(p.scroll);
  }
  const repeat = ref(p.repeat);
  if (repeat) place.repeat = repeat;
  if (p.doc && typeof p.doc === 'object') {
    const d = p.doc as Record<string, unknown>;
    if (typeof d.product === 'string' && typeof d.src === 'string' && d.product && d.src) {
      place.doc = { product: d.product, src: d.src };
    }
  }
  if (p.settings === true) place.settings = true;
  if (typeof p.search === 'string') place.search = p.search;
  if (typeof p.row === 'string' && p.row) place.row = p.row;
  return place;
}

// HOW FAR DOWN THE OPEN TASK SHE IS, written on its own.
//
// The place is written when she MOVES, and scrolling is not a move: nothing
// about which page she is on changes, so folding it into that effect would mean
// re-rendering the app on every scroll event to tell it something it does not
// use. This patches the one field into the place already on disk, and does
// nothing at all when there is no task in it — a scroll position with no task
// to belong to is not a place.
export function writeScroll(storage: Pick<Storage, 'getItem' | 'setItem'>, top: number): void {
  const place = readPlace(storage);
  if (!place?.item) return;
  if (top > 0) place.scroll = Math.round(top);
  else delete place.scroll;
  writePlace(storage, place);
}

export function writePlace(storage: Pick<Storage, 'setItem'>, place: Place): void {
  try { storage.setItem(KEY, JSON.stringify(place)); } catch { /* a full disk is not worth a crash */ }
}

// WHETHER THERE IS ANYWHERE TO GO. A place that is the inbox with nothing open
// is where a reload lands anyway, so restoring it is work with no effect, and
// saying so lets the boot screen decide instantly whether it has to wait for
// the snapshot before drawing. Without this, every reload holds the window on
// "the app" for a frame it did not need to.
export function placeIsSomewhere(place: Place | null): place is Place {
  if (!place) return false;
  return place.view !== 'inbox'
    || !!place.item || !!place.repeat || !!place.settings
    || place.search !== undefined || !!place.row;
}
