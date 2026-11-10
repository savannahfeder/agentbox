// Every new thread opens on Medium, whatever the last one was tagged.
//
// The card used to remember the last level picked (`zero.lastPriority`), so
// one Urgent thread made the next one Urgent too, and the one after. A tester
// on a brand-new account found every thread preset to Urgent, because that
// memory lived on the Mac and not in the account, and Urgent rows rise above
// everything in the inbox: "If everything starts as Urgent, the priority order
// stops meaning anything." The founder's call, 2026-10-05: all new threads
// default to Medium. A level still holds for the card it was picked on, so a
// half-written card that comes back keeps its own tag.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { startingPriority } from '../renderer/src/priority.ts';
import { readComposeDraft, saveComposeDraft, clearComposeDraft } from '../renderer/src/drafts.ts';

const fakeStore = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
};

// What both cards do on mount: the draft's own tag, else untagged (Medium).
const cardOpensOn = (store) => startingPriority(readComposeDraft(store).priority) ?? 'medium';

const draft = (priority) => ({
  text: 'Cut the film to thirty seconds',
  attachments: [], priority, when: { runAt: 0, repeat: null }, dropped: 0,
});

describe('a new thread', () => {
  it('opens on Medium after an Urgent one was sent', () => {
    const store = fakeStore();
    saveComposeDraft(draft('urgent'), store);
    clearComposeDraft(store);
    expect(cardOpensOn(store)).toBe('medium');
  });

  it('opens on Medium even when an old remembered Urgent is still in storage', () => {
    const store = fakeStore();
    store.setItem('zero.lastPriority', 'urgent');
    expect(cardOpensOn(store)).toBe('medium');
  });

  it('opens on Medium after a Low one too, not only after Urgent', () => {
    const store = fakeStore();
    saveComposeDraft(draft('low'), store);
    clearComposeDraft(store);
    expect(cardOpensOn(store)).toBe('medium');
  });
});

describe('a card left half-written', () => {
  it('keeps the level picked on it', () => {
    const store = fakeStore();
    saveComposeDraft(draft('urgent'), store);
    expect(cardOpensOn(store)).toBe('urgent');
  });

  it('reads a stale level in the draft as untagged, not as a crash', () => {
    expect(startingPriority('catastrophic')).toBe(null);
    expect(startingPriority(undefined)).toBe(null);
  });
});

describe('both new-thread cards', () => {
  for (const file of ['renderer/src/threads/ThreadComposer.tsx', 'renderer/src/components/Compose.tsx']) {
    it(`${file} starts from the draft alone and remembers no level across sends`, () => {
      const src = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(src).toMatch(/startingPriority\(opened\.current\.priority\)/);
      expect(src).not.toMatch(/readLastPriority|writeLastPriority|lastPriority/);
    });
  }
});
