// PURE. WHAT A Z LEAVES IN THE THREAD IT UNDID (w-c78d1e1607).
//
// The thread draws your own actions as a timeline, and a Z left nothing there
// that said Z: inside the three second grace window nothing reaches the ledger
// at all, and past it the undo's own writes read as "Withdrew your reply" and
// "Sent it back". After picking an option and pressing Z there was no telling
// from the thread whether the pick had gone through.
//
// So every Z on a task keeps one mark here, on this Mac, and the thread draws
// it as one of your actions ("Undid picking <the option>"). It is kept beside
// the ledger rather than in it because most undos happen inside the grace
// window, where the action was never written: the ledger stays a record of
// what happened to the task, and this is a record of what you pressed.
//
// `from` and `at` are when the undo started and when it finished. The ledger
// lines it wrote in between are its own bookkeeping, and the thread folds them
// under the mark (item-thread.ts).

export const UNDO_MARKS_KEY = 'zero.undoMarks.v1';

/** Enough for every recent thread, few enough that reading it costs nothing. */
export const MAX_UNDO_MARKS = 300;

export interface UndoMark {
  product: string;
  id: string;
  from: number;
  at: number;
  /** "Undid closing it", "Undid picking". */
  words: string;
  /** A pick's option, drawn brighter after `words`. */
  choice?: string;
}

/** What an undo entry says about itself, before it has run. */
export type UndidSpec = Pick<UndoMark, 'product' | 'id' | 'words' | 'choice'>;

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

const defaultStore = (): Storage | null => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

const isMark = (m: unknown): m is UndoMark => {
  const x = m as UndoMark;
  return !!x && typeof x.product === 'string' && typeof x.id === 'string' && typeof x.words === 'string'
    && Number.isFinite(x.from) && Number.isFinite(x.at);
};

export function readUndoMarks(store: Storage | null = defaultStore()): UndoMark[] {
  try {
    const raw = JSON.parse(store?.getItem(UNDO_MARKS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isMark) : [];
  } catch {
    return [];
  }
}

export function addUndoMark(mark: UndoMark, store: Storage | null = defaultStore()): void {
  const next = [...readUndoMarks(store), mark].slice(-MAX_UNDO_MARKS);
  try { store?.setItem(UNDO_MARKS_KEY, JSON.stringify(next)); } catch { /* the undo itself still stands */ }
}

export function marksFor(marks: readonly UndoMark[], product: string, id: string): UndoMark[] {
  return marks.filter((m) => m.product === product && m.id === id);
}

/** The window event the thread listens for, so a mark shows the moment it is left. */
export const UNDO_MARKS_EVENT = 'undo-marks-changed';
