// TYPING ON THE NEW THREAD CARD IS TYPING, NEVER A PRESS (w-abed8ae491).
//
// A tester on the Linux QA box filed a task twice and both times the card sent
// it half-written. One thread's whole brief was the word "Make"; the rest of
// the sentence turned up in that thread's reply box, with six characters gone
// for good. The second attempt went out as "...default no" and the card was
// left holding "e, and add a test for it.".
//
// MEASURED ON THE REAL CARD, in a browser, before this change
// (scripts/scratch/card/, gitignored). Three routes, none of them exotic:
//
//   - Four Tabs out of the message box land on Send. Space or Enter there
//     sends whatever is written so far. That is the thread called "Make".
//   - A click anywhere on the card that is not a control — its padding, the
//     head — puts the keyboard on BODY, and from then on every character typed
//     is dropped without a word. That is the missing " the r".
//   - Escape out of the project menu puts the keyboard back on the project
//     chip, by design. Typing " the receipt" there gave "Makereceipt": the
//     space pressed the chip, three more characters went into the open menu,
//     and a wrong key on a row would have changed the project the task is for.
//
// So the rule below, and the card wires it to the window rather than to itself,
// because BODY is not inside the card and a handler on the card never hears it.
//
// WHAT THIS COSTS: Enter and Space no longer open a menu from a focused
// trigger. The arrow keys already do that (`triggerKeys`), and Send has ⌘↵
// printed on its own face, so every control still has a keyboard route.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyOnTheNewThreadCard } from '../renderer/src/threads/composer-rules';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');

const key = (over = {}) => keyOnTheNewThreadCard({
  key: 'a', meta: false, ctrl: false, alt: false, menuOpen: false, on: 'the card', ...over,
});

describe('a character typed while the keyboard is loose on the card', () => {
  it('goes into the message when a control has it, so Space cannot press Send', () => {
    expect(key({ key: ' ', on: 'the card' })).toBe('the message');
    expect(key({ key: 'Enter', on: 'the card' })).toBe('the message');
  });

  it('goes into the message when nothing at all has it', () => {
    expect(key({ key: 'M', on: 'nothing' })).toBe('the message');
    expect(key({ key: ' ', on: 'nothing' })).toBe('the message');
  });

  it('is left alone while the caret is in a field, which takes its own keys', () => {
    expect(key({ on: 'a field' })).toBe('leave it');
    expect(key({ key: ' ', on: 'a field' })).toBe('leave it');
  });

  it('is left alone while one of the card menus is open, where rows are picked', () => {
    expect(key({ menuOpen: true, on: 'the card' })).toBe('leave it');
    expect(key({ key: 'Enter', menuOpen: true, on: 'the card' })).toBe('leave it');
  });

  it('is left alone when something outside the card has the keyboard', () => {
    expect(key({ on: 'away' })).toBe('leave it');
  });
});

describe('what is not typing', () => {
  it('leaves the send chord alone, so ⌘↵ and Ctrl+↵ still send', () => {
    expect(key({ key: 'Enter', meta: true })).toBe('leave it');
    expect(key({ key: 'Enter', ctrl: true })).toBe('leave it');
  });

  it('leaves every other chord alone', () => {
    expect(key({ key: 'a', meta: true })).toBe('leave it');
    expect(key({ key: 'k', ctrl: true })).toBe('leave it');
    expect(key({ key: 'x', alt: true })).toBe('leave it');
  });

  it('leaves the keys that are not characters alone', () => {
    for (const k of ['Escape', 'Tab', 'ArrowDown', 'ArrowUp', 'Backspace', 'F5', 'Shift']) {
      expect(key({ key: k })).toBe('leave it');
    }
  });

  it('takes a shifted letter, which is a character like any other', () => {
    expect(key({ key: 'A' })).toBe('the message');
  });
});

describe('the card wires it', () => {
  const card = src('threads', 'ThreadComposer.tsx');

  it('asks the rule on a window keydown, because BODY is outside the card', () => {
    expect(card).toContain('keyOnTheNewThreadCard');
    expect(card).toMatch(/window\.addEventListener\('keydown'/);
  });

  it('stops the key reaching the button under it', () => {
    expect(card).toMatch(/keyOnTheNewThreadCard\([\s\S]{0,400}?e\.preventDefault\(\)/);
  });

  it('takes the keyboard the moment it opens, so the first character is not lost', () => {
    // A passive effect can land after the next keystroke has already been
    // dispatched, which is how "Task" arrived as "ask" (F-38).
    expect(card).toMatch(/useLayoutEffect\(\(\) => \{\s*const t = textRef\.current;/);
  });
});
