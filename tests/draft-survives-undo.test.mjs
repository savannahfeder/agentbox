// Sending takes the words; undoing gives them back.
//
// Her exact sequence, against the same functions the composer and the undo call.
import { describe, it, expect } from 'vitest';
import { draftKey, readDraft, saveDraft, clearDraft, restoreDraft } from '../renderer/src/drafts';

const ITEM = { product: 'cascade', id: 'w-c53b8b9d76' };

function fakeStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
    size: () => map.size,
  };
}

describe('her words, through a send and a Z', () => {
  it('comes back to the reply box after an undone send', () => {
    const store = fakeStore();
    const words = 'Ship the join key fix, then tell me what the live page shows.';

    saveDraft(ITEM, words, store);            // she types
    clearDraft(ITEM, store);                  // she sends: the composer empties
    expect(readDraft(ITEM, store)).toBe('');  // (this much was always right)

    expect(restoreDraft(ITEM, words, [], store)).toBe(true);   // she hits Z
    expect(readDraft(ITEM, store)).toBe(words);            // the bug: this was ''
  });

  it('restores under the key the composer opens with, so it is simply there', () => {
    const store = fakeStore();
    restoreDraft(ITEM, 'a paragraph she does not want to retype', [], store);
    expect(store.getItem(draftKey(ITEM))).toBe('a paragraph she does not want to retype');
    expect(draftKey(ITEM)).toBe('zero.draft.cascade:w-c53b8b9d76');
  });

  it('never overwrites words she has typed since sending', () => {
    const store = fakeStore();
    saveDraft(ITEM, 'the new thing I am writing now', store);
    expect(restoreDraft(ITEM, 'the older thing I sent', [], store)).toBe(false);
    expect(readDraft(ITEM, store)).toBe('the new thing I am writing now');
  });

  it('says nothing came back when there was nothing to return', () => {
    const store = fakeStore();
    expect(restoreDraft(ITEM, '', [], store)).toBe(false);
    expect(restoreDraft(ITEM, '   ', [], store)).toBe(false);
    expect(restoreDraft(ITEM, null, [], store)).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('keeps one draft per thread', () => {
    const store = fakeStore();
    const other = { product: 'cascade', id: 'w-b52ca7221a' };
    saveDraft(ITEM, 'thread one', store);
    saveDraft(other, 'thread two', store);
    expect(readDraft(ITEM, store)).toBe('thread one');
    expect(readDraft(other, store)).toBe('thread two');
  });

  it('treats an empty draft as no draft, so the composer does not open on nothing', () => {
    const store = fakeStore();
    saveDraft(ITEM, 'something', store);
    saveDraft(ITEM, '', store);
    expect(store.getItem(draftKey(ITEM))).toBe(null);
  });
});
