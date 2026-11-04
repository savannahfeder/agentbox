// PURE. The comment someone is still writing on a file, kept per file version
// so it outlives the open view: another thread, another picture, a restart.
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
  try {
    const s = backing(store);
    if (draft.words.trim()) s.setItem(commentDraftKey(ref), JSON.stringify(draft));
    else s.removeItem(commentDraftKey(ref));
  } catch { /* no storage, nothing kept */ }
}
