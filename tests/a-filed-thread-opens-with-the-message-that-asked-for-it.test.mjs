// A THREAD FILED FROM ANOTHER ONE OPENS WITH THE MESSAGE THAT ASKED FOR IT,
// NOT WITH WHATEVER WAS SAID THERE LAST.
//
// What broke (2026-10-15): on the launch film thread the user wrote at 13:03:10
// "can you make a separate thread ... for the glass component", and the agent
// filed that thread at 13:03:26. At 13:08:35 she wrote on the launch film
// thread again, about the last shot of the train scene. Opening the new glass
// card thread then showed the 13:08:35 message as its first line, with that
// time on it: a message written five minutes after the thread existed, about
// something else. Measured on her real ledger: parent answers at 13:03:10 and
// 13:08:35, child created at 13:03:26, and the thread drew the second.
//
// The cause: `recapFor` read the parent's `answer`, and the fold keeps only the
// newest value of a field, so the opening line moved every time she replied on
// the parent. The ask is the last thing she said there AT OR BEFORE the child
// was filed, which only the parent's ledger lines still know.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { afterEach, beforeEach, vi } from 'vitest';
import { recapFor, askedBefore } from '../renderer/src/recap';
import { Store } from '../main/store.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const ASK = 'Also can you make a separate thread with the intent to explore different design approaches for the glass component?';
const LATER = "I'd say this is really good, except for the last shot.";
const ASKED_AT = 1_000_310;   // 13:03:10
const FILED_AT = 1_000_326;   // 13:03:26
const LATER_AT = 1_000_835;   // 13:08:35

const said = (ts, answer, source = 'founder') => ({ id: 'w-parent', ts, source, patch: { answer } });

const parent = (over = {}) => ({
  id: 'w-parent', product: 'p', productName: 'P', status: 'claimed', title: 'So I want us to make a really spectacular launch video',
  kind: 'directive', body: 'So I want us to make a really spectacular launch video for cloud.', labels: [], priority: 0, epoch: 0, claim: null,
  createdAt: 1000, updatedAt: LATER_AT, answer: LATER, wrote: { answer: { ts: LATER_AT, source: 'founder' } }, ...over,
});
const child = (over = {}) => ({
  id: 'w-child', product: 'p', productName: 'P', status: 'claimed', title: 'Glass card design proposals for launch film',
  kind: 'task', labels: [], priority: 0, epoch: 0, claim: null, parent: 'w-parent',
  createdAt: FILED_AT, updatedAt: FILED_AT + 50, ...over,
});

const history = [
  said(900_000, 'an older note about the forest'),
  said(ASKED_AT, ASK),
  { id: 'w-parent', ts: 1_000_500, source: 'agent', patch: { note: 'rendering the window seat version' } },
  said(LATER_AT, LATER),
];

describe('the opening line of a filed thread', () => {
  it('is the message that asked for it, at its own time, not the newest one on the parent', () => {
    expect(recapFor(child(), parent(), history)).toEqual({
      kind: 'said', text: ASK, at: ASKED_AT, on: parent().title,
    });
  });

  it('counts a message written in the same millisecond the thread was filed', () => {
    const r = recapFor(child({ createdAt: ASKED_AT }), parent(), history);
    expect(r.text).toBe(ASK);
  });

  it('does not count a message written one millisecond after it was filed', () => {
    const r = recapFor(child({ createdAt: ASKED_AT - 1 }), parent(), history);
    expect(r.text).toBe('an older note about the forest');
  });

  // The must-not-match: she never replied on the parent before the thread
  // was filed, so the ask is the body she composed, and the reply she wrote
  // afterwards is not it.
  it('falls back to the body she composed when every reply came after', () => {
    const r = recapFor(child({ createdAt: 2000 }), parent(), history);
    expect(r).toEqual({ kind: 'said', text: parent().body, at: 1000, on: parent().title });
  });

  it('and to nothing at all when that parent is an agent message', () => {
    // Her words are the only thing that opens a thread. The parent's title
    // used to be drawn above the message instead, and that box is gone
    // (tests/nothing-is-quoted-above-the-message).
    const r = recapFor(child({ createdAt: 2000 }), parent({ kind: 'question' }), history);
    expect(r).toBeNull();
  });

  it('skips a send she took back, and what it took back', () => {
    const lines = [said(ASKED_AT - 20, ASK), said(ASKED_AT - 10, 'a typo'), said(ASKED_AT - 10, '(withdrawn)'), said(LATER_AT, LATER)];
    expect(recapFor(child(), parent(), lines).text).toBe(ASK);
  });

  // Before the parent's lines have been read, a parent reply newer than the
  // thread cannot be its ask, and nothing is better than the wrong message.
  it('shows nothing while it cannot yet tell, rather than the newer reply', () => {
    expect(recapFor(child(), parent())).toBeNull();
  });

  // The common case needs no read at all: the newest reply on the parent was
  // written before the thread was filed, so it is the ask.
  it('uses the parent reply straight away when it came before the thread', () => {
    const p = parent({ answer: ASK, wrote: { answer: { ts: ASKED_AT, source: 'founder' } }, updatedAt: ASKED_AT });
    expect(recapFor(child(), p)).toEqual({ kind: 'said', text: ASK, at: ASKED_AT, on: p.title });
  });

  it('a reply on the thread itself still ends it, whatever the parent says', () => {
    const r = recapFor(child({ answer: 'go', wrote: { answer: { ts: LATER_AT + 5, source: 'founder' } } }), parent(), history);
    expect(r).toBeNull();
  });
});

describe('askedBefore', () => {
  it('reads only replies, and only up to the moment given', () => {
    expect(askedBefore(history, FILED_AT)).toEqual({ text: ASK, at: ASKED_AT });
    expect(askedBefore(history, LATER_AT)).toEqual({ text: LATER, at: LATER_AT });
    expect(askedBefore(history, 100)).toBeNull();
    expect(askedBefore([], FILED_AT)).toBeNull();
  });
});

// The history read stops at a moment, and only then counts back its cap. A
// long parent (hers has thousands of lines) would otherwise have lost the ask
// off the front of the 400 newest by the time the thread was opened.
describe('reading a history up to a moment', () => {
  let root, store, id;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'asked-before-'));
    const dir = path.join(root, 'kestrel');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'kestrel', name: 'kestrel' }));
    store = await new Store({ accountRoot: root, products: [] }).init();
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    id = store.composeItem('kestrel', { title: 'the launch film' }).id;
    for (let i = 1; i <= 5; i += 1) {
      vi.setSystemTime(10_000 + i * 1000);
      store.answerItem('kestrel', id, { answer: `reply ${i}` });
    }
  });
  afterEach(() => { vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });

  const replies = (lines) => lines.map((l) => l.patch?.answer).filter(Boolean);

  it('keeps every line without a moment', () => {
    expect(replies(store.readHistory('kestrel', id))).toEqual(['reply 1', 'reply 2', 'reply 3', 'reply 4', 'reply 5']);
  });

  it('keeps the line written at the moment and drops the one a millisecond after', () => {
    expect(replies(store.readHistory('kestrel', id, { before: 13_000 }))).toEqual(['reply 1', 'reply 2', 'reply 3']);
    expect(replies(store.readHistory('kestrel', id, { before: 12_999 }))).toEqual(['reply 1', 'reply 2']);
  });

  it('counts its cap back from the moment, not from the newest line', () => {
    expect(replies(store.readHistory('kestrel', id, { before: 13_000, max: 1 }))).toEqual(['reply 3']);
  });
});

// The pane has to hand the parent's lines over, read up to the moment the
// thread was filed, or the rule above never runs in the app.
describe('the reading pane', () => {
  const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');
  it('reads the parent history up to when this thread was filed and passes it on', () => {
    expect(focus).toMatch(/itemHistory\(\{ product: parent\.product, id: parent\.id, before: item\.createdAt \}\)/);
    expect(focus).toMatch(/recapFor\(item, parent, parentLines\?\.key === askKey \? parentLines\.lines : undefined\)/);
    expect(focus).not.toMatch(/recapFor\(item, parent\)/);
  });
});
