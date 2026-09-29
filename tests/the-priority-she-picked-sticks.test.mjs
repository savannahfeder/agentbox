// The new task card forgot her priority the moment she sent.
//
// The card held the level in the compose draft and NOWHERE ELSE, and a send
// clears that draft (`clearComposeDraft`, Compose.tsx). So the level she had
// just chosen died with the card that carried it: tag one task urgent, send it,
// press the plus again and the sentence reads "Medium priority." — untagged,
// sending 5. The PROJECT never had this problem, because picking one writes
// `zero.lastProduct` on the click. The level is the same fact about the same
// card and it simply had no key.
//
// These pin the three things that made it a bug rather than a preference:
// it survives the send, her own draft still outranks it, and a stale string in
// storage opens the card untagged instead of breaking it.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  LAST_PRIORITY_KEY,
  PRIORITIES,
  priorityIdOf,
  priorityValueOf,
  readLastPriority,
  writeLastPriority,
} from '../renderer/src/priority.ts';
import { readComposeDraft, saveComposeDraft, clearComposeDraft } from '../renderer/src/drafts.ts';

const fakeStore = (refuse = false) => {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (refuse) throw new Error('QuotaExceededError'); map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
};

// What Compose.tsx does on mount, in one line, so the rule is testable without
// rendering a card: her half-written card wins, then what she last picked.
const cardOpensOn = (store) =>
  (readComposeDraft(store).priority ?? null) ?? readLastPriority(store);

let store;
beforeEach(() => { store = fakeStore(); });

describe('the level she picked', () => {
  it('is there on the next card, after the send cleared the draft', () => {
    // She tags one urgent and sends it.
    writeLastPriority('urgent', store);
    saveComposeDraft({
      text: 'Cut the film to thirty seconds',
      attachments: [], priority: 'urgent', when: { runAt: 0, repeat: null }, dropped: 0,
    }, store);
    clearComposeDraft(store);

    // The next card opens urgent, not medium.
    expect(cardOpensOn(store)).toBe('urgent');
    expect(priorityValueOf(cardOpensOn(store))).toBe(9);
  });

  it('changes when she changes it, and only then', () => {
    writeLastPriority('urgent', store);
    expect(readLastPriority(store)).toBe('urgent');
    writeLastPriority('low', store);
    expect(readLastPriority(store)).toBe('low');
  });

  it('holds every level the four words name', () => {
    for (const p of PRIORITIES) {
      writeLastPriority(p.id, store);
      expect(readLastPriority(store)).toBe(p.id);
      expect(priorityIdOf(priorityValueOf(readLastPriority(store)))).toBe(p.id);
    }
  });
});

describe('what it must not run over', () => {
  it('leaves a half-written card on its own tag', () => {
    // She was mid-card at medium when something interrupted her, and the last
    // thing she SENT was urgent. The card she left is the one that comes back.
    writeLastPriority('urgent', store);
    saveComposeDraft({
      text: 'Ask Sam about the video',
      attachments: [], priority: 'medium', when: { runAt: 0, repeat: null }, dropped: 0,
    }, store);
    expect(cardOpensOn(store)).toBe('medium');
  });

  it('opens untagged when she has never picked one', () => {
    expect(readLastPriority(store)).toBe(null);
    expect(cardOpensOn(store)).toBe(null);
  });
});

describe('storage that misbehaves', () => {
  it('opens the card untagged rather than breaking on a stale value', () => {
    store.setItem(LAST_PRIORITY_KEY, 'catastrophic');
    expect(readLastPriority(store)).toBe(null);
    store.setItem(LAST_PRIORITY_KEY, '9');
    expect(readLastPriority(store)).toBe(null);
  });

  it('never throws out of the click that picked the level', () => {
    const full = fakeStore(true);
    expect(() => writeLastPriority('urgent', full)).not.toThrow();
    expect(readLastPriority(full)).toBe(null);
  });
});
