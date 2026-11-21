// A REPLY THAT LANDS LATE AFTER A RELOAD IS NOT PUT BACK IN THE BOX.
//
// In the overnight cloud power test of 2026-11-16 a reply sent just before a
// reload vanished, then showed up in the thread with its first time and the
// agent answered it, while the same words sat in the reply box; the next
// thing typed went out with the old reply on top (twice, one tester). After a
// reload the page looked for each reply in flight once, eight seconds after
// the send, and put back any its thread did not hold yet. Just after a restart
// the write can still be on its way, or the history read can fail, and either
// put a sent reply back. Now it looks again before deciding.
import { describe, it, expect } from 'vitest';
import { readDraft, markReplyInFlight, repliesInFlight, bringBackWhenSure } from '../renderer/src/drafts';

const ITEM = { product: 'demo', id: 'w-3d7f1c0413' };

function fakeStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
  };
}

const landed = (answer: string) => ({ ok: true, lines: [{ source: 'founder', patch: { answer } }] });
const empty = { ok: true, lines: [] };
const failed = { ok: false, lines: [] };

function sent(words: string) {
  const store = fakeStore();
  markReplyInFlight(ITEM, { words, attachments: [] }, words, 1000, store);
  return { store, replies: repliesInFlight(store)[0].replies };
}

function reads(...answers: Array<{ ok: boolean; lines: Array<{ source?: string; patch?: Record<string, unknown> }> }>) {
  let n = 0;
  return { read: async () => answers[Math.min(n++, answers.length - 1)], count: () => n };
}

const now = { checks: [0, 0, 0], wait: async () => {} };

describe('after a reload, a reply in flight', () => {
  it('whose write lands after the first look is not put back', async () => {
    const { store, replies } = sent('Add --min-drop');
    const history = reads(empty, landed('Add --min-drop'));
    expect(await bringBackWhenSure(ITEM, replies, history.read, () => [], { ...now, store })).toBe(0);
    expect(readDraft(ITEM, store)).toBe('');
    expect(repliesInFlight(store)).toEqual([]);
  });

  it('whose history could not be read at first is not put back once it can', async () => {
    const { store, replies } = sent('Add --min-drop');
    const history = reads(failed, landed('Add --min-drop'));
    expect(await bringBackWhenSure(ITEM, replies, history.read, () => [], { ...now, store })).toBe(0);
    expect(readDraft(ITEM, store)).toBe('');
  });

  it('that landed is let go at the first look, with no more reads', async () => {
    const { store, replies } = sent('Add --min-drop');
    const history = reads(landed('Add --min-drop'));
    expect(await bringBackWhenSure(ITEM, replies, history.read, () => [], { ...now, store })).toBe(0);
    expect(history.count()).toBe(1);
  });

  it('that never lands is back in the box once, after the last look', async () => {
    const { store, replies } = sent('Add --min-drop');
    const history = reads(empty);
    expect(await bringBackWhenSure(ITEM, replies, history.read, () => [], { ...now, store })).toBe(1);
    expect(history.count()).toBe(3);
    expect(readDraft(ITEM, store)).toBe('Add --min-drop');
    expect(repliesInFlight(store)).toEqual([]);
  });

  it('whose history is never readable still comes back, so no words are lost', async () => {
    const { store, replies } = sent('Add --min-drop');
    expect(await bringBackWhenSure(ITEM, replies, reads(failed).read, () => [], { ...now, store })).toBe(1);
    expect(readDraft(ITEM, store)).toBe('Add --min-drop');
  });
});
