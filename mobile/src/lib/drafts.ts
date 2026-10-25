// AN UNSENT MESSAGE OUTLIVES ITS SCREEN: the phone site's drafts
// (renderer/src/drafts.ts), under the same keys, for the new-thread page
// ('new') and each thread's reply box. The words, the files and, on the new
// thread, the priority, written down on every change.
import { useRef, useState } from 'react';
import { isImageName } from '../../../renderer/src/attachments';
import {
  clearDraft, dropComposeDraft, readComposeDraft, readDraft, readDraftAttachments, restoreComposeDraft, restoreDraft,
  restoreFailedDraft, saveComposeDraft, saveDraft, saveDraftAttachments, type DraftAttachment, type DraftStore, type ItemRef,
} from '../../../renderer/src/drafts';
import { startingPriority, type PriorityId } from '../../../renderer/src/priority';
import type { Picked } from '../platform/pick';

export type DraftKey = ItemRef | 'new';
export interface Draft { text: string; files: Picked[]; priority: PriorityId | null }

const EMPTY: Draft = { text: '', files: [], priority: null };
export const asDraftFile = (f: Picked): DraftAttachment => ({ name: f.name, dataBase64: f.dataBase64, image: isImageName(f.name) });
// A file kept only as a path on a Mac cannot be sent from a phone.
const asPicked = (a: DraftAttachment): Picked[] => (a.dataBase64 ? [{ name: a.name, dataBase64: a.dataBase64 }] : []);

export function readDraftOf(key: DraftKey, store: DraftStore): Draft {
  if (key === 'new') {
    const d = readComposeDraft(store);
    return { text: d.text, files: d.attachments.flatMap(asPicked), priority: startingPriority(d.priority) };
  }
  return { text: readDraft(key, store), files: readDraftAttachments(key, store).flatMap(asPicked), priority: null };
}

/** Writes the draft down; `dropped` is how many files would not fit. */
export function saveDraftOf(key: DraftKey, d: Draft, store: DraftStore): { dropped: number } {
  if (key === 'new') {
    const stored = saveComposeDraft({ text: d.text, attachments: d.files.map(asDraftFile), priority: d.priority, when: { runAt: 0, repeat: null }, dropped: 0 }, store);
    return { dropped: stored.dropped };
  }
  saveDraft(key, d.text, store);
  return { dropped: saveDraftAttachments(key, d.files.map(asDraftFile), store).dropped.length };
}

/** What a send takes off the box, leaving it empty. */
export function takeDraftOf(key: DraftKey, store: DraftStore): Draft {
  if (key === 'new') {
    const d = readComposeDraft(store);
    dropComposeDraft(d, store);
    return { text: d.text, files: d.attachments.flatMap(asPicked), priority: startingPriority(d.priority) };
  }
  const taken = readDraftOf(key, store);
  clearDraft(key, store);
  return taken;
}

/** A send that failed: its words go back, beside anything typed since. */
export function giveBackDraft(key: DraftKey, taken: Draft, store: DraftStore): void {
  if (key === 'new') saveDraftOf('new', taken, store);
  else restoreFailedDraft(key, taken.text, taken.files.map(asDraftFile), store);
}

/** An undone send: its words go back only if nothing new was typed. */
export function restoreDraftOf(key: DraftKey, taken: Draft, store: DraftStore): boolean {
  if (key === 'new') return restoreComposeDraft({ text: taken.text, attachments: taken.files.map(asDraftFile), priority: taken.priority, when: { runAt: 0, repeat: null }, dropped: 0 }, store);
  return restoreDraft(key, taken.text, taken.files.map(asDraftFile), store);
}

/**
 * A box's draft, kept in `store` as it changes. `take` empties the box for a
 * send; `giveBack` after a failed one; `restore` after an undo, which
 * declines over newer words.
 */
export function useDraft(key: DraftKey, store: DraftStore) {
  const id = key === 'new' ? 'new' : `${key.product}:${key.id}`;
  const [held, setHeld] = useState<{ id: string; draft: Draft; dropped: number }>(() => ({ id, draft: readDraftOf(key, store), dropped: 0 }));
  // The same screen can be handed another thread; the draft follows it.
  const current = held.id === id ? held : { id, draft: readDraftOf(key, store), dropped: 0 };
  // Changes build on the newest draft, not the one this render drew: a file
  // picker answers after the words may have moved on.
  const latest = useRef(current);
  latest.current = current;
  const put = (next: { id: string; draft: Draft; dropped: number }) => { latest.current = next; setHeld(next); };
  const change = (edit: (d: Draft) => Draft) => {
    const next = edit(latest.current.draft);
    put({ id, draft: next, dropped: saveDraftOf(key, next, store).dropped });
  };
  const reread = () => put({ id, draft: readDraftOf(key, store), dropped: 0 });
  return {
    ...current.draft,
    /** Files that would not fit in the store, so the box can say so. */
    dropped: current.dropped,
    setText: (text: string) => change((d) => ({ ...d, text })),
    setFiles: (files: Picked[] | ((now: Picked[]) => Picked[])) => change((d) => ({ ...d, files: typeof files === 'function' ? files(d.files) : files })),
    setPriority: (priority: PriorityId | null) => change((d) => ({ ...d, priority })),
    take: (): Draft => { const taken = takeDraftOf(key, store); put({ id, draft: EMPTY, dropped: 0 }); return taken; },
    giveBack: (taken: Draft) => { giveBackDraft(key, taken, store); reread(); },
    restore: (taken: Draft) => { const back = restoreDraftOf(key, taken, store); if (back) reread(); return back; },
  };
}

/**
 * A store that answers at once, over a file a phone reads when first asked
 * and writes `wait` ms after the last change; `flush` writes now, for the app
 * going to the background. A file it cannot read starts it empty.
 */
export function syncStore({ read, write, wait = 400 }: { read: () => string | null; write: (text: string) => Promise<void>; wait?: number }) {
  let held: Record<string, string> | null = null;
  const all = (): Record<string, string> => {
    if (held) return held;
    try {
      const parsed = JSON.parse(read() ?? '{}');
      held = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { held = {}; }
    return held!;
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    const text = JSON.stringify(all());
    writing = writing.then(() => write(text)).catch(() => { /* kept for this launch */ });
    return writing;
  };
  const soon = () => { if (!timer) timer = setTimeout(flush, wait); };
  return {
    getItem: (k: string) => { const v = all()[k]; return typeof v === 'string' ? v : null; },
    setItem: (k: string, v: string) => { all()[k] = String(v); soon(); },
    removeItem: (k: string) => { if (k in all()) { delete all()[k]; soon(); } },
    flush,
  };
}
