// A REPLY SENT JUST BEFORE A RELOAD IS NOT LOST (w-d49129337e).
//
// Reported: "I wrote a response to an agent, then reloaded the page, and then
// the response disappeared."
//
// Measured on 1c457db4: the reply box cleared its stored draft the moment Send
// was pressed (Focus.tsx, `clearDraft` before `onSend`), and from then until the
// write came back the only copy was in the page's memory: the three-second undo
// hold, then the call to the computer. Nothing reloads cleanly through every
// path that can cut that short. The browser copy's calls had no `keepalive`, so
// a reload aborted one in flight; a phone on a slow link, a conversation (whose
// write waits on another call first) and a page that crashed all lost the words
// with no copy anywhere. Reloading the local browser copy at 50 ms, 1 s, 2.95 s
// and 6 s after Send kept the reply, so the loss needs one of those slower paths.
//
// The fix: the words stay in storage until the write lands, and the next load
// puts back any that never reached the thread.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readDraft, saveDraft, readDraftAttachments,
  markReplyInFlight, replyLanded, repliesInFlight, landedIn, bringBackUnsent,
} from '../renderer/src/drafts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');

const ITEM = { product: 'demo', id: 'w-3d7f1c0413' };
const OTHER = { product: 'demo', id: 'w-579ac7788a' };

function fakeStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

const answerLine = (answer, ts = 1000) => ({ id: ITEM.id, ts, source: 'founder', patch: { answer } });

describe('a reply is kept until its write lands', () => {
  it('is still in storage after Send, and gone once the write lands', () => {
    const store = fakeStore();
    const at = markReplyInFlight(ITEM, { words: 'Check the footer too', attachments: [] }, 'Check the footer too', 1000, store);
    expect(repliesInFlight(store)).toEqual([{ ...ITEM, replies: [{ words: 'Check the footer too', body: 'Check the footer too', attachments: [], at: 1000 }] }]);
    replyLanded(ITEM, at, store);
    expect(repliesInFlight(store)).toEqual([]);
  });

  it('a landing takes off only its own send, not a newer one on the same thread', () => {
    const store = fakeStore();
    const first = markReplyInFlight(ITEM, { words: 'one', attachments: [] }, 'one', 1000, store);
    markReplyInFlight(ITEM, { words: 'two', attachments: [] }, 'two', 1001, store);
    replyLanded(ITEM, first, store);
    expect(repliesInFlight(store)[0].replies.map((r) => r.words)).toEqual(['two']);
  });

  it('two sends in the same millisecond are still two', () => {
    const store = fakeStore();
    const a = markReplyInFlight(ITEM, { words: 'one', attachments: [] }, 'one', 1000, store);
    const b = markReplyInFlight(ITEM, { words: 'two', attachments: [] }, 'two', 1000, store);
    expect(a).not.toBe(b);
    replyLanded(ITEM, b, store);
    expect(repliesInFlight(store)[0].replies.map((r) => r.words)).toEqual(['one']);
  });

  it('lists every thread with a send in flight, and nothing else in storage', () => {
    const store = fakeStore({ 'zero.draft.demo:w-3d7f1c0413': 'a draft', 'zero.lastProduct': 'demo' });
    markReplyInFlight(ITEM, { words: 'a', attachments: [] }, 'a', 1, store);
    markReplyInFlight(OTHER, { words: 'b', attachments: [] }, 'b', 2, store);
    expect(repliesInFlight(store).map((r) => r.id).sort()).toEqual([ITEM.id, OTHER.id].sort());
  });

  it('a pasted picture too big for storage does not stop the words being kept', () => {
    const store = fakeStore();
    const big = { name: 'shot.png', dataBase64: 'x'.repeat(4_000_000), image: true };
    markReplyInFlight(ITEM, { words: 'see the shot', attachments: [big] }, 'see the shot', 1, store);
    const [kept] = repliesInFlight(store)[0].replies;
    expect(kept.words).toBe('see the shot');
    expect(kept.attachments).toEqual([]);
  });

  it('a store that refuses every write does not stop the send', () => {
    const store = { ...fakeStore(), setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(() => markReplyInFlight(ITEM, { words: 'w', attachments: [] }, 'w', 1, store)).not.toThrow();
  });
});

describe('whether a reply reached its thread', () => {
  const reply = { words: 'Check the footer too', body: 'Check the footer too', attachments: [], at: 1000 };

  it('did, when the thread holds an answer with the same words', () => {
    expect(landedIn(reply, [answerLine('Check the footer too')])).toBe(true);
  });

  it('did, when the answer carries the words with something added (a picture link, a mention)', () => {
    const withPicture = { ...reply, body: 'Check the footer too\n\n![shot.png](attachments/x-shot.png)' };
    expect(landedIn(withPicture, [answerLine('Check the footer too\n\n![shot.png](attachments/x-shot.png)')])).toBe(true);
    expect(landedIn(reply, [answerLine('[[Ana]] Check   the footer\ntoo')])).toBe(true);
  });

  it('did, when the phone shows it waiting for the computer', () => {
    expect(landedIn(reply, [], ['Check the footer too'])).toBe(true);
  });

  it('did not, when the thread has only other words', () => {
    expect(landedIn(reply, [answerLine('Check the header')])).toBe(false);
    expect(landedIn(reply, [{ id: ITEM.id, ts: 2000, source: 'agent', patch: { result: 'Check the footer too' } }])).toBe(false);
    expect(landedIn(reply, [])).toBe(false);
  });
});

describe('the next load puts back what never landed', () => {
  it('a reply that never reached the thread is back in its reply box', () => {
    const store = fakeStore();
    markReplyInFlight(ITEM, { words: 'Check the footer too', attachments: [] }, 'Check the footer too', 1000, store);
    const [left] = repliesInFlight(store);
    expect(bringBackUnsent(ITEM, left.replies, [], [], store)).toBe(1);
    expect(readDraft(ITEM, store)).toBe('Check the footer too');
    expect(repliesInFlight(store)).toEqual([]);
  });

  it('a reply that did land is not put back, and is let go', () => {
    const store = fakeStore();
    markReplyInFlight(ITEM, { words: 'Check the footer too', attachments: [] }, 'Check the footer too', 1000, store);
    const [left] = repliesInFlight(store);
    expect(bringBackUnsent(ITEM, left.replies, [answerLine('Check the footer too')], [], store)).toBe(0);
    expect(readDraft(ITEM, store)).toBe('');
    expect(repliesInFlight(store)).toEqual([]);
  });

  it('words typed since are kept, with the lost reply after them, pictures included', () => {
    const store = fakeStore();
    const shot = { name: 'shot.png', dataBase64: 'aGk=', image: true };
    markReplyInFlight(ITEM, { words: 'the lost reply', attachments: [shot] }, 'the lost reply', 1000, store);
    saveDraft(ITEM, 'typed after the reload', store);
    const [left] = repliesInFlight(store);
    bringBackUnsent(ITEM, left.replies, [], [], store);
    expect(readDraft(ITEM, store)).toBe('typed after the reload\n\nthe lost reply');
    expect(readDraftAttachments(ITEM, store).map((a) => a.name)).toEqual(['shot.png']);
  });

  it('a send made since the check was scheduled is not touched', () => {
    const store = fakeStore();
    markReplyInFlight(ITEM, { words: 'old', attachments: [] }, 'old', 1000, store);
    const [left] = repliesInFlight(store);
    markReplyInFlight(ITEM, { words: 'new, still in its hold', attachments: [] }, 'new, still in its hold', 5000, store);
    bringBackUnsent(ITEM, left.replies, [], [], store);
    expect(repliesInFlight(store)[0].replies.map((r) => r.words)).toEqual(['new, still in its hold']);
    expect(readDraft(ITEM, store)).toBe('old');
  });
});

describe('the app keeps the words until the write lands, and asks on load', () => {
  const app = read('renderer', 'src', 'App.tsx');
  const answerWith = app.slice(app.indexOf('const answerWith = useCallback'), app.indexOf('answerWithRef.current = answerWith;'));

  it('marks a reply from the box in flight before anything can wait', () => {
    const mark = answerWith.indexOf('markReplyInFlight(');
    expect(mark).toBeGreaterThan(0);
    expect(mark).toBeLessThan(answerWith.indexOf('await '));
  });

  it('lets it go on every way the send ends: written, failed, taken back', () => {
    expect(answerWith.match(/replyLanded\(|landed\(\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(answerWith).toMatch(/const putBack = \(error: unknown\) => \{\s*landed\(\);/);
  });

  it('looks for replies left in flight once the screen has loaded', () => {
    expect(app).toMatch(/repliesInFlight\(\)/);
    expect(app).toMatch(/bringBackUnsent\(/);
  });

  it('a write from the browser copy outlives a reload that starts while it is on its way', () => {
    const bridge = read('renderer', 'src', 'browser-bridge.ts');
    expect(bridge).toMatch(/keepalive:/);
  });
});
