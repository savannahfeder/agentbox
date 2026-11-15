// A REPLY TYPED AT THE GLOWING BOX IS A REPLY, NOT A HANDFUL OF SHORTCUTS.
//
// QA walked the browser version's first run on 2026-10-25 (F-70). On the
// answer beat the reply box glows and the card says "Press R or click the
// reply box", so they did what the glow invites and typed a reply without
// clicking in first. The box had no caret, so every letter went to the list:
// the first "e" was the beat's second key and marked the thread done, which
// moved the walk on to the clearing beat where E is the cap, so the next "e"s
// closed rows too and an "l" snoozed one. Five threads in Needs you became
// two, and the card had jumped to "Press L to deal with it later."
//
// Measured on the walk's own rules rather than in a browser: this repo has no
// jsdom, and what went wrong is the rule, not a browser's dispatch.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coach, typedAtTheBox } from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** A stand-in for a DOM node, in the shape `pressCounts` reads. */
const node = (is, parent = null) => ({
  is,
  parent,
  closest(sel) {
    const want = sel.split(',').map((s) => s.trim());
    for (let n = this; n; n = n.parent) if (want.includes(n.is)) return n;
    return null;
  },
});

const press = (key, extra = {}) => ({ key, ...extra });
/** The answer beat before a reply: the one the box glows on. */
const asking = coach('answer', 0, {});

describe('1. the beat that glows the box says so', () => {
  it('asks for a reply, with R as its cap and E beside it', () => {
    expect(asking.key).toBe('R');
    expect(asking.alt).toBe('E');
    expect(asking.intoTheBox).toBe(true);
  });

  it('and the halves of the beat that are not asking for one do not', () => {
    expect(coach('answer', 0, { replying: true }).intoTheBox).toBeUndefined();
    expect(coach('answer', 0, { replies: 1 }).intoTheBox).toBeUndefined();
    expect(coach('clear', 0, { left: 3 })?.intoTheBox).toBeUndefined();
    expect(coach('snooze', 0, {})?.intoTheBox).toBeUndefined();
  });
});

describe('2. a letter typed at the glowing box opens it', () => {
  it('takes the letters a reply is made of', () => {
    for (const k of ['y', 'Y', 's', 'h', 'o', 't', '3']) {
      expect(typedAtTheBox(asking, press(k), null)).toBe(true);
    }
  });

  it('and leaves the two keys the card names alone', () => {
    // R opens the box already, and E marks the thread done: both are on the card.
    expect(typedAtTheBox(asking, press('r'), null)).toBe(false);
    expect(typedAtTheBox(asking, press('E'), null)).toBe(false);
  });

  it('and is not a rule anywhere else in the walk', () => {
    expect(typedAtTheBox(coach('clear', 0, { left: 3 }), press('y'), null)).toBe(false);
    expect(typedAtTheBox(coach('answer', 0, { replying: true }), press('y'), null)).toBe(false);
  });

  it('and never fires at a caret that is already in something', () => {
    const inBox = node('textarea', node('.dock-card', node('.focus-dock')));
    expect(typedAtTheBox(asking, press('y'), inBox)).toBe(false);
  });

  it('and never off a chord, which belongs to the menu and the OS', () => {
    expect(typedAtTheBox(asking, press('r', { metaKey: true }), null)).toBe(false);
    expect(typedAtTheBox(asking, press('y', { metaKey: true }), null)).toBe(false);
    expect(typedAtTheBox(asking, press('y', { ctrlKey: true }), null)).toBe(false);
    expect(typedAtTheBox(asking, press('Enter'), null)).toBe(false);
    expect(typedAtTheBox(asking, press('Tab'), null)).toBe(false);
    expect(typedAtTheBox(asking, press('ArrowDown'), null)).toBe(false);
  });
});

describe('3. and the walk is wired to it', () => {
  const card = read('renderer/src/components/Onboarding.tsx');
  const app = read('renderer/src/App.tsx');

  it('the coaching card stops the press and opens the box instead', () => {
    const at = card.indexOf('if (typedAtTheBox(');
    expect(at, 'the card never asks typedAtTheBox').toBeGreaterThan(-1);
    const body = card.slice(at, at + 400);
    expect(body).toMatch(/e\.preventDefault\(\)/);
    expect(body).toMatch(/e\.stopImmediatePropagation\(\)/);
    expect(body).toMatch(/intoTheBox\.current\?\.\(e\.key\)/);
  });

  it('and it is asked before the beat hands its second key to the app', () => {
    const body = card.slice(card.indexOf('const on = (e: KeyboardEvent) =>', card.indexOf('setWrong(0);')));
    expect(body.indexOf('typedAtTheBox(')).toBeLessThan(body.indexOf('say.alt && keyToken(e) === say.alt'));
  });

  it('and the app opens the same box R opens, with that letter in it', () => {
    const at = app.indexOf('onType={(letter) => {');
    expect(at, 'the app never takes a typed letter').toBeGreaterThan(-1);
    const body = app.slice(at, at + 300);
    // The draft first, because `restoreDraft` leaves a draft alone: otherwise
    // the box opens with the written-for-you reply and their sentence lands on
    // the end of it.
    expect(body.indexOf('saveDraft(')).toBeLessThan(body.indexOf("setModal('reply')"));
  });
});

describe('4. and the card stops calling their words ours', () => {
  it('says the reply is written for you only when it is', () => {
    expect(coach('answer', 0, { replying: true }).quiet).toBe('Your reply is written for you.');
    const theirs = coach('answer', 0, { replying: true, wrote: true });
    expect(theirs.quiet).toBe(asking.quiet);
    // Both halves still say the one thing to press, and it is the same thing.
    expect(theirs.key).toBe('⌘↵');
    expect(coach('answer', 0, { replying: true }).key).toBe('⌘↵');
  });
});
