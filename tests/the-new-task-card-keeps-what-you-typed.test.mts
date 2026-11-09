// The new task card kept NOTHING when it closed.
//
// Compose should save drafts the way the reply box does. The reply box kept
// the typed words and dropped pasted images. Compose was worse: `Compose.tsx` opened on `useState('')` for the text and
// `useState([])` for the images, every single time, so Escape, a click on the
// backdrop or a reload took the whole sentence with it. There was no draft for
// that card anywhere in the app.
//
// These pin what the card now holds, and the one rule under all of it: WHEN
// SOMETHING CANNOT BE KEPT, THE WORDS STILL LAND AND THE APP SAYS WHAT WENT.
// A draft that silently comes back short is the same failure one level down.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  COMPOSE_DRAFT_KEY,
  COMPOSE_DRAFT_MAX_BYTES,
  readComposeDraft,
  saveComposeDraft,
  clearComposeDraft,
  composeDraftIsEmpty,
} from '../renderer/src/drafts.ts';

// A localStorage stand-in. `cap` is the quota: setItem throws past it, which is
// exactly what a real browser does and the case that used to take everything.
const fakeStore = (cap = Infinity) => {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      const total = [...map.entries()].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0) + v.length;
      if (total > cap) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      map.set(k, v);
    },
    removeItem: (k) => { map.delete(k); },
  };
};

const image = (name, kb) => ({ name, dataBase64: 'A'.repeat(kb * 1024), image: true });

let store;
beforeEach(() => { store = fakeStore(); });

describe('the card she closed', () => {
  it('comes back with the sentence she was in the middle of', () => {
    saveComposeDraft({
      text: 'Look at why the digest ran twice on Sun',
      attachments: [], priority: null, when: { runAt: 0, repeat: null }, dropped: 0,
    }, store);
    // She hits Escape. Nothing else happens: the draft is on disk already.
    expect(readComposeDraft(store).text).toBe('Look at why the digest ran twice on Sun');
  });

  it('comes back with the pasted images too, not just the words', () => {
    saveComposeDraft({
      text: 'this is the screen I mean',
      attachments: [image('pasted-1.png', 4), { name: 'notes.txt', srcPath: '/tmp/notes.txt', image: false }],
      priority: null, when: { runAt: 0, repeat: null }, dropped: 0,
    }, store);
    const back = readComposeDraft(store);
    expect(back.attachments).toHaveLength(2);
    expect(back.attachments[0].dataBase64).toHaveLength(4 * 1024);
    expect(back.attachments[1].srcPath).toBe('/tmp/notes.txt');
    expect(back.dropped).toBe(0);
  });

  it('comes back with the priority and the clock she set, not half a card', () => {
    saveComposeDraft({
      text: 'ship the landing copy',
      attachments: [],
      priority: 'urgent',
      when: { runAt: 1786930000000, repeat: null },
      dropped: 0,
    }, store);
    const back = readComposeDraft(store);
    expect(back.priority).toBe('urgent');
    expect(back.when.runAt).toBe(1786930000000);
  });

  it('keeps a repeat rule as a rule', () => {
    const rule = { every: 'day', at: '06:00' };
    saveComposeDraft({
      text: 'every day at 6am, check the queue',
      attachments: [], priority: null, when: { runAt: 0, repeat: rule }, dropped: 0,
    }, store);
    expect(readComposeDraft(store).when.repeat).toEqual(rule);
  });
});

describe('what is not a draft', () => {
  it('an untouched card stores nothing at all', () => {
    saveComposeDraft({ text: '', attachments: [], priority: null, when: { runAt: 0, repeat: null }, dropped: 0 }, store);
    expect(store.map.has(COMPOSE_DRAFT_KEY)).toBe(false);
    expect(composeDraftIsEmpty(readComposeDraft(store))).toBe(true);
  });

  it('emptying a card she had typed in removes the draft', () => {
    saveComposeDraft({ text: 'half a thought', attachments: [], priority: null, when: { runAt: 0, repeat: null }, dropped: 0 }, store);
    expect(store.map.has(COMPOSE_DRAFT_KEY)).toBe(true);
    saveComposeDraft({ text: '', attachments: [], priority: null, when: { runAt: 0, repeat: null }, dropped: 0 }, store);
    expect(store.map.has(COMPOSE_DRAFT_KEY)).toBe(false);
  });

  it('a picture with no words is still a draft', () => {
    saveComposeDraft({
      text: '', attachments: [image('pasted-1.png', 2)], priority: null, when: { runAt: 0, repeat: null }, dropped: 0,
    }, store);
    expect(composeDraftIsEmpty(readComposeDraft(store))).toBe(false);
  });

  it('sending clears it', () => {
    saveComposeDraft({ text: 'sent', attachments: [], priority: null, when: { runAt: 0, repeat: null }, dropped: 0 }, store);
    clearComposeDraft(store);
    expect(readComposeDraft(store).text).toBe('');
  });
});

describe('when it does not fit', () => {
  it('drops image bytes rather than her sentence, and counts what went', () => {
    const huge = Math.ceil(COMPOSE_DRAFT_MAX_BYTES / 1024) + 8;   // one image bigger than the whole budget
    const stored = saveComposeDraft({
      text: 'the bug is in this screenshot',
      attachments: [image('small.png', 4), image('enormous.png', huge)],
      priority: 'high', when: { runAt: 0, repeat: null }, dropped: 0,
    }, store);
    expect(stored.dropped).toBe(1);
    expect(stored.attachments.map((a) => a.name)).toEqual(['small.png']);

    const back = readComposeDraft(store);
    expect(back.text).toBe('the bug is in this screenshot');   // the words never go
    expect(back.priority).toBe('high');
    expect(back.dropped).toBe(1);
  });

  it('drops the newest paste first, so the picture she has been looking at longest survives', () => {
    const half = Math.ceil(COMPOSE_DRAFT_MAX_BYTES / 1024 / 2);
    const stored = saveComposeDraft({
      text: 'two big ones',
      attachments: [image('first.png', half), image('second.png', half)],
      priority: null, when: { runAt: 0, repeat: null }, dropped: 0,
    }, store);
    expect(stored.attachments.map((a) => a.name)).toEqual(['first.png']);
    expect(stored.dropped).toBe(1);
  });

  it('a file that is only a path costs nothing, so it is never the one dropped', () => {
    const huge = Math.ceil(COMPOSE_DRAFT_MAX_BYTES / 1024) + 8;
    const stored = saveComposeDraft({
      text: 'with a dropped file',
      attachments: [image('enormous.png', huge), { name: 'log.txt', srcPath: '/tmp/log.txt', image: false }],
      priority: null, when: { runAt: 0, repeat: null }, dropped: 0,
    }, store);
    expect(stored.attachments.map((a) => a.name)).toEqual(['log.txt']);
    expect(stored.dropped).toBe(1);
  });

  it('a full store still takes her words', () => {
    // The quota is smaller than one image and bigger than the sentence: this is
    // the case where the old card lost everything and the new one loses a
    // picture. setItem THROWS here; nothing may escape.
    const tight = fakeStore(4_000);
    const stored = saveComposeDraft({
      text: 'the thing I do not want to retype',
      attachments: [image('pasted-1.png', 64)],
      priority: null, when: { runAt: 0, repeat: null }, dropped: 0,
    }, tight);
    expect(stored.dropped).toBe(1);
    expect(readComposeDraft(tight).text).toBe('the thing I do not want to retype');
    expect(readComposeDraft(tight).attachments).toEqual([]);
  });

  it('a store that refuses everything loses nothing else: no throw, empty read', () => {
    const dead = fakeStore(0);
    expect(() => saveComposeDraft({
      text: 'x', attachments: [], priority: null, when: { runAt: 0, repeat: null }, dropped: 0,
    }, dead)).not.toThrow();
    expect(readComposeDraft(dead).text).toBe('');
  });
});

describe('a draft that is not a draft', () => {
  it('junk in storage opens an empty card instead of breaking it', () => {
    store.setItem(COMPOSE_DRAFT_KEY, 'not json {{{');
    expect(composeDraftIsEmpty(readComposeDraft(store))).toBe(true);
  });

  it('the wrong shape is read down to what is usable, not trusted', () => {
    store.setItem(COMPOSE_DRAFT_KEY, JSON.stringify({
      text: 42, attachments: [{ name: 'no bytes and no path' }, null, image('ok.png', 1)],
      priority: { not: 'a string' }, when: 'tomorrow', dropped: -3,
    }));
    const back = readComposeDraft(store);
    expect(back.text).toBe('');
    expect(back.attachments.map((a) => a.name)).toEqual(['ok.png']);
    expect(back.priority).toBe(null);
    expect(back.when).toEqual({ runAt: 0, repeat: null });
    expect(back.dropped).toBe(0);
  });
});
