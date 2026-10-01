// Z AFTER A SEND TAKES BACK THE TASK SHE JUST SENT, not something else.
//
// Both halves were true. Sending was the ONE action in the app that pushed
// nothing onto the undo stack, and the stack lives for the whole session, so Z
// popped whatever was underneath — an archive from ten minutes earlier, a reply
// withdrawn out of a thread she was not looking at. And `Compose.send` clears
// the draft the moment a send stands, so the sentence she wanted to add cost
// her the whole task retyped.
//
// Measured in her own store on 2026-08-20, before this landed: two founder
// tasks filed twice under the same title inside a minute (08-17 20:47:32 then
// 20:48:00; 08-21 04:53:46 then 04:54:59), with a worker already claimed on the
// first copy 8 to 14 seconds in. That is two agents on one job, twice.
//
// Two things are guarded here. The RULE, which is pure and lives in drafts.ts,
// and the WIRING, which is one line in App.tsx that a future edit could drop
// without any test noticing.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPOSE_DRAFT_KEY,
  EMPTY_COMPOSE_DRAFT,
  readComposeDraft,
  saveComposeDraft,
  clearComposeDraft,
  restoreComposeDraft,
} from '../renderer/src/drafts';
// The toast's own sentence, which lives beside the compose card's other one
// now rather than as a literal in App.tsx.
import { sentLine } from '../renderer/src/compose-says';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');

function fakeStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
    size: () => map.size,
  };
}

const CARD = {
  ...EMPTY_COMPOSE_DRAFT,
  text: 'Look at why the download button on the landing page is slow on my phone.',
  priority: 'urgent',
  when: { runAt: 1787290000000, repeat: null },
};

describe('her sequence: write a task, send it, hit Z', () => {
  it('puts the whole card back, so the sentence she forgot costs one line and not the task', () => {
    const store = fakeStore();

    saveComposeDraft(CARD, store);                       // she writes it
    clearComposeDraft(store);                            // she sends: the card empties
    expect(readComposeDraft(store).text).toBe('');       // (this much was always right)

    expect(restoreComposeDraft(CARD, store)).toBe(true); // she hits Z
    const back = readComposeDraft(store);
    expect(back.text).toBe(CARD.text);                   // the bug: this was ''
    expect(back.priority).toBe('urgent');                // and the tag came with it
    expect(back.when.runAt).toBe(1787290000000);         // and so did the clock
  });

  it('restores under the key the card opens with, so it is simply there', () => {
    const store = fakeStore();
    restoreComposeDraft(CARD, store);
    expect(JSON.parse(store.getItem(COMPOSE_DRAFT_KEY)).text).toBe(CARD.text);
  });

  it('never overwrites a card she has started since sending', () => {
    const store = fakeStore();
    saveComposeDraft({ ...EMPTY_COMPOSE_DRAFT, text: 'the new thing I am writing now' }, store);
    expect(restoreComposeDraft(CARD, store)).toBe(false);
    expect(readComposeDraft(store).text).toBe('the new thing I am writing now');
  });

  it('says nothing came back when there was nothing to return', () => {
    const store = fakeStore();
    expect(restoreComposeDraft(EMPTY_COMPOSE_DRAFT, store)).toBe(false);
    expect(restoreComposeDraft(null, store)).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('counts a tag or a clock alone as something worth handing back', () => {
    const store = fakeStore();
    const tagged = { ...EMPTY_COMPOSE_DRAFT, priority: 'urgent' };
    expect(restoreComposeDraft(tagged, store)).toBe(true);
    expect(readComposeDraft(store).priority).toBe('urgent');
  });
});

describe('the wiring, which is the half a pure test cannot see', () => {
  const app = src('App.tsx');

  it('sending a task leaves a way back on the undo stack', () => {
    // Before this, `await api.compose(p)` stood alone and Z reached past it.
    // The call gained an argument on, because the first run's own example task
    // is composed with a label on it; what is asserted here is unchanged,
    // which is that the ordinary send is followed by a way back.
    expect(app).toMatch(/const made = await api\.compose\(/);
    expect(app).toMatch(/if \(made\?\.id\) \{\s*\n\s*noteNewTask\(/);
  });

  it('reads the card BEFORE the write, because Compose clears it after', () => {
    const send = app.slice(app.indexOf('onSend={async (p) => {'));
    const readAt = send.indexOf('readComposeDraft()');
    const writeAt = send.indexOf('await api.compose(');
    expect(readAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(readAt);
  });

  it('withdrawing stops the worker as well as closing the row', () => {
    // main/ipc.mjs kills the session on any archive, so one call does both.
    const ipc = fs.readFileSync(path.join(here, '..', 'main', 'ipc.mjs'), 'utf8');
    expect(ipc).toMatch(/if \(status === 'done'\) supervisor\.stopSession\(id\)/);
    // 2026-09-27: the second argument is the plain phrase a late Z asks with,
    // "press Z again to take back the task you just made" (renderer/src/undo-window.ts).
    expect(app).toMatch(/noteNewTask\(`Withdrawn: \$\{clipToSentence\(p\.title, TOAST_TITLE\)\}`, 'take back the task you just made', sent, async \(\) => \{\s*\n\s*await api\.answer\(\{ product: p\.product, id: made\.id, status: 'done' \}\)/);
  });

  it('a repeating task is undoable too, or Z means two different things on one card', () => {
    expect(app).toMatch(/await api\.endRepeat\(\{ product: p\.product, id: rule!\.id! \}\)/);
  });

  it('says Z out loud on the toast, because a way back she cannot see is one she will not take', () => {
    // THE SENTENCE MOVED, THE RULE DID NOT. This used to read the literal
    // "Queued → ${to} · Z to undo" out of App.tsx. a tester pressed Start, the
    // card closed and she could not tell that anything had happened at all, so
    // the wording is now ../renderer/src/ compose-says.ts — "Sent to Kestrel ·
    // Z to undo" — where it has tests of its own
    // (a-practice-task-is-refused-and-a-real-one-says-where-it-went). What
    // this file has always been about is that the way back is SAID, so it
    // asserts that and stops holding the words hostage.
    expect(app).toMatch(/showToast\(sentLine\(\{/);
    expect(sentLine({ to: 'Kestrel' })).toContain('Z to undo');
    expect(app).toMatch(/Repeating → \$\{to\} · Z to undo/);
  });

  it('sends her back to the card, not to a thread that does not exist', () => {
    // Which of the two it is comes from `shownAfterUndo` in undo-window.ts
    // (pinned in z-puts-the-row-back-in-front-of-her), since w-7eb39d3c97.
    expect(app).toMatch(/else if \(shown\.compose\) \{ setFocused\(null\); setModal\('compose'\); \}/);
    // "Thread", her word for a row since w-ec62ab6b38 (2026-09-28).
    expect(app).toMatch(/your thread is back in the new thread card/);
  });

  it('fixtures answer with the task, so this path can be pressed and photographed', () => {
    // Returning null here made the send look like it had made nothing, which
    // silently disabled the undo in the one mode built for reviewing it.
    const api = src('api.ts');
    // The slice ends at the NEXT method rather than far down the file: other
    // methods below it are allowed their own fixture guards, and reading one of
    // those as compose's is how this test failed on a change it does not care
    // about.
    const from = api.indexOf('async compose(p:');
    const compose = api.slice(from, api.indexOf('\n  async ', from + 10));
    expect(compose).not.toMatch(/if \(useFixtures\) return null/);
    expect(compose).toMatch(/id: `w-fixture/);
  });
});
