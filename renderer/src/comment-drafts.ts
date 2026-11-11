// PURE. The comment someone is still writing on a file, kept so it outlives the
// open view: another thread, another picture, a restart.
import type { NotePlace } from './types';
import type { DraftStore } from './drafts';

export interface CommentDraftRef { product: string; thread?: string; file: string }
export interface CommentDraft { words: string; place: NotePlace | null }

const NONE: CommentDraft = { words: '', place: null };

const backing = (store?: DraftStore): DraftStore =>
  store ?? ((globalThis as unknown as { localStorage: DraftStore }).localStorage);

export function commentDraftKey(ref: CommentDraftRef): string {
  return `zero.commentdraft.${ref.product}:${ref.thread ?? ''}:${ref.file}`;
}

export function readCommentDraft(ref: CommentDraftRef, store?: DraftStore): CommentDraft {
  try {
    const raw = backing(store).getItem(commentDraftKey(ref));
    if (!raw) return NONE;
    const d = JSON.parse(raw) as Partial<CommentDraft>;
    if (typeof d.words !== 'string') return NONE;
    return { words: d.words, place: d.place && typeof d.place === 'object' ? d.place : null };
  } catch {
    return NONE;
  }
}

/** A pin with no words is not kept: it is one click to place again. */
export function saveCommentDraft(ref: CommentDraftRef, draft: CommentDraft, store?: DraftStore): void {
  writeKey(commentDraftKey(ref), draft, store);
}

function writeKey(key: string, draft: CommentDraft, store?: DraftStore): void {
  try {
    const s = backing(store);
    if (draft.words.trim()) s.setItem(key, JSON.stringify(draft));
    else s.removeItem(key);
  } catch { /* no storage, nothing kept */ }
}

// Words with no pin travel from file to file within `across` (a thread, Files,
// one group); a pin, region or quote ties them to the file they were placed on.
export interface TravellingRef extends CommentDraftRef { across: string }
export type Holding = 'file' | 'loose';

const looseKey = (ref: TravellingRef) => `zero.commentdraft.loose.${ref.across}`;
const tiedToTheFile = (place: NotePlace | null) => !!place && place.kind !== 'whole';

export function readLooseDraft(ref: TravellingRef, store?: DraftStore): CommentDraft {
  try {
    const raw = backing(store).getItem(looseKey(ref));
    const d = raw ? JSON.parse(raw) as Partial<CommentDraft> : null;
    return typeof d?.words === 'string' ? { words: d.words, place: null } : NONE;
  } catch {
    return NONE;
  }
}

/** The file's own draft wins, so a pinned comment is never covered by the notes you carried. */
export function openCommentDraft(ref: TravellingRef, store?: DraftStore): CommentDraft & { holding: Holding } {
  const own = readCommentDraft(ref, store);
  if (own.words) return { ...own, holding: 'file' };
  return { ...readLooseDraft(ref, store), holding: 'loose' };
}

/** Writes the box where it belongs and says where it now lives. */
export function keepCommentDraft(ref: TravellingRef, draft: CommentDraft, holding: Holding, store?: DraftStore): Holding {
  if (tiedToTheFile(draft.place)) {
    saveCommentDraft(ref, draft, store);
    if (holding === 'loose') writeKey(looseKey(ref), NONE, store);
    return 'file';
  }
  const words = { words: draft.words, place: null };
  if (holding === 'loose') { writeKey(looseKey(ref), words, store); return 'loose'; }
  // Unpinned on its file: it travels, unless other notes already are and it would cover them.
  if (draft.words.trim() && !readLooseDraft(ref, store).words.trim()) {
    writeKey(looseKey(ref), words, store);
    saveCommentDraft(ref, NONE, store);
    return 'loose';
  }
  saveCommentDraft(ref, draft, store);
  return 'file';
}
