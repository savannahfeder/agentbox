// THE PHONE APP KEEPS AN UNSENT MESSAGE WHEN YOU LEAVE (docs/mobile/PLAN.md).
//
// The phone site writes the new-thread card and every reply box down on each
// keystroke (renderer/src/drafts.ts), so leaving a thread or reloading never
// takes the words or the pictures. The app held both in the screen's own
// state, and backing out of a half-written thread lost it; Codex's parity
// audit found it. The app now keeps the same drafts under the same keys
// (mobile/src/lib/drafts.ts), in a store a phone can read at once: one file,
// read when first asked, written a moment after the last change. These pin the
// round trip for both kinds of draft, the send that takes the words and the
// failed send that gives them back, the undo that must not write over newer
// words, and what must not be kept: an empty draft, and a file read as a
// picture when it is not one.
import { describe, it, expect, vi } from 'vitest';
import { asDraftFile, giveBackDraft, readDraftOf, restoreDraftOf, saveDraftOf, syncStore, takeDraftOf } from '../mobile/src/lib/drafts';
import { COMPOSE_DRAFT_KEY, draftKey, draftImagesKey } from '../renderer/src/drafts';

function memory() {
  const kept = new Map();
  return { kept, getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => { kept.set(k, String(v)); }, removeItem: (k) => { kept.delete(k); } };
}
const THREAD = { product: 'alpha@a1b2c3d4e5f6', id: 'w-1' };
const SHOT = { name: 'screen.png', dataBase64: 'iVBORw0KGgo=' };
const NOTES = { name: 'notes.txt', dataBase64: 'aGVsbG8=' };

describe('a reply box on a thread', () => {
  it('keeps its words and pictures under the phone site\'s own keys', () => {
    const store = memory();
    saveDraftOf(THREAD, { text: 'Ship it after lunch', files: [SHOT], priority: null }, store);
    expect(store.getItem(draftKey(THREAD))).toBe('Ship it after lunch');
    expect(JSON.parse(store.getItem(draftImagesKey(THREAD)))).toEqual([{ name: 'screen.png', dataBase64: 'iVBORw0KGgo=', image: true }]);
    expect(readDraftOf(THREAD, store)).toEqual({ text: 'Ship it after lunch', files: [SHOT], priority: null });
  });

  it('a send takes it, and a failed send puts it back beside anything typed since', () => {
    const store = memory();
    saveDraftOf(THREAD, { text: 'First thought', files: [SHOT], priority: null }, store);
    const taken = takeDraftOf(THREAD, store);
    expect(taken).toEqual({ text: 'First thought', files: [SHOT], priority: null });
    expect(readDraftOf(THREAD, store)).toEqual({ text: '', files: [], priority: null });
    saveDraftOf(THREAD, { text: 'Second thought', files: [], priority: null }, store);
    giveBackDraft(THREAD, taken, store);
    expect(readDraftOf(THREAD, store)).toEqual({ text: 'Second thought\n\nFirst thought', files: [SHOT], priority: null });
  });

  it('an undo hands the words back, but never over words typed since', () => {
    const store = memory();
    expect(restoreDraftOf(THREAD, { text: 'Sent too soon', files: [], priority: null }, store)).toBe(true);
    expect(readDraftOf(THREAD, store).text).toBe('Sent too soon');
    expect(restoreDraftOf(THREAD, { text: 'An older message', files: [], priority: null }, store)).toBe(false);
    expect(readDraftOf(THREAD, store).text).toBe('Sent too soon');
  });

  it('an empty box is not a draft', () => {
    const store = memory();
    saveDraftOf(THREAD, { text: 'x', files: [SHOT], priority: null }, store);
    saveDraftOf(THREAD, { text: '', files: [], priority: null }, store);
    expect(store.kept.size).toBe(0);
  });
});

describe('the new thread card', () => {
  it('keeps its words, files and priority as the phone site\'s card does', () => {
    const store = memory();
    saveDraftOf('new', { text: 'Draw the settings page', files: [NOTES], priority: 'high' }, store);
    expect(JSON.parse(store.getItem(COMPOSE_DRAFT_KEY))).toMatchObject({ text: 'Draw the settings page', priority: 'high', attachments: [{ name: 'notes.txt', image: false }] });
    expect(readDraftOf('new', store)).toEqual({ text: 'Draw the settings page', files: [NOTES], priority: 'high' });
  });

  it('a send takes the card, and a failed one writes it back whole', () => {
    const store = memory();
    saveDraftOf('new', { text: 'Rename the menu', files: [], priority: 'urgent' }, store);
    const taken = takeDraftOf('new', store);
    expect(store.getItem(COMPOSE_DRAFT_KEY)).toBeNull();
    giveBackDraft('new', taken, store);
    expect(readDraftOf('new', store)).toEqual({ text: 'Rename the menu', files: [], priority: 'urgent' });
  });

  it('an untouched card is not kept, and the store\'s own word on priority is not trusted blindly', () => {
    const store = memory();
    saveDraftOf('new', { text: '  ', files: [], priority: null }, store);
    expect(store.getItem(COMPOSE_DRAFT_KEY)).toBeNull();
    store.setItem(COMPOSE_DRAFT_KEY, JSON.stringify({ text: 'Hi', priority: 'whenever' }));
    expect(readDraftOf('new', store).priority).toBeNull();
  });
});

describe('what a file is', () => {
  it('a picture is drawn as one, by the phone site\'s rule; anything else is a file', () => {
    expect(asDraftFile({ name: 'IMG_0001.JPG', dataBase64: 'x' }).image).toBe(true);
    expect(asDraftFile({ name: 'clip.webp', dataBase64: 'x' }).image).toBe(true);
    expect(asDraftFile({ name: 'plan.pdf', dataBase64: 'x' }).image).toBe(false);
    expect(asDraftFile({ name: 'png-notes.txt', dataBase64: 'x' }).image).toBe(false);
  });
});

describe('the store a phone keeps them in', () => {
  it('reads its file once, when first asked, and writes once after a burst of changes', async () => {
    vi.useFakeTimers();
    try {
      const read = vi.fn(() => JSON.stringify({ a: '1' }));
      const writes = [];
      const store = syncStore({ read, write: async (text) => { writes.push(text); }, wait: 400 });
      expect(read).not.toHaveBeenCalled();
      expect(store.getItem('a')).toBe('1');
      store.setItem('b', '2');
      store.setItem('b', '3');
      store.removeItem('a');
      expect(writes).toEqual([]);
      await vi.advanceTimersByTimeAsync(400);
      expect(read).toHaveBeenCalledTimes(1);
      expect(writes.map((w) => JSON.parse(w))).toEqual([{ b: '3' }]);
    } finally { vi.useRealTimers(); }
  });

  it('writes at once when the app goes to the background', async () => {
    const writes = [];
    const store = syncStore({ read: () => null, write: async (text) => { writes.push(text); }, wait: 60_000 });
    store.setItem('zero.draft.x:w-1', 'half a sentence');
    await store.flush();
    expect(writes.map((w) => JSON.parse(w))).toEqual([{ 'zero.draft.x:w-1': 'half a sentence' }]);
  });

  it('a file it cannot read starts empty rather than not at all', () => {
    const store = syncStore({ read: () => '{not json', write: async () => {} });
    expect(store.getItem('anything')).toBeNull();
    store.setItem('k', 'v');
    expect(store.getItem('k')).toBe('v');
  });
});
