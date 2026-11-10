// ESCAPE OUT OF A REPLY BOX WITH WORDS IN IT LEFT EVERY KEY DEAD.
//
// Found in the 3-hour cloud test, 2026-10-22. Escape in a box you have typed
// into does not fold the box — a draft holds it open, deliberately, because
// folding a box mid-sentence reads as the app swallowing what you wrote — it
// takes the caret out of it (Focus.tsx). The key handler's gate then returned
// on every key while `modal` was 'reply', so L, E, J and K did nothing and
// said nothing until a second Escape folded the box. Measured: three keys, no
// toast, no movement.
//
// The same shape as the click-away fix above it in App.tsx, which found the
// same gate from the other direction: a click on nothing left the caret out of
// the box and `modal` at 'reply', and every letter in the app was dead.
//
// So the gate is a rule rather than a condition, in renderer/src/keys.ts with
// the other two, and what it has to keep is as important as what it changes:
// a caret in ANY field still owns every key, and every other modal still
// swallows them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyWhileABoxIsOpen } from '../renderer/src/keys';
import { focusTheReplyBox } from '../renderer/src/focus-at-end';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

describe('the reply box open with the caret out of it', () => {
  const aside = (key) => keyWhileABoxIsOpen({ modal: 'reply', inInput: false, key });

  it('gives the list keys back', () => {
    for (const key of ['l', 'L', 'e', 'E', 'j', 'k', 'r', 'z', '1']) expect(aside(key)).toBe('through');
  });

  it('still folds the box on a second Escape', () => {
    expect(aside('Escape')).toBe('close-the-modal');
  });
});

describe('what the gate still swallows', () => {
  it('every key while the caret is in a field, the reply box included', () => {
    for (const key of ['l', 'e', 'j', 'Escape']) {
      expect(keyWhileABoxIsOpen({ modal: 'reply', inInput: true, key })).toBe('swallow');
      expect(keyWhileABoxIsOpen({ modal: null, inInput: true, key })).toBe('swallow');
    }
  });

  it('every key under another modal, which owns its own screen', () => {
    for (const modal of ['compose', 'filter', 'palette', 'snooze']) {
      expect(keyWhileABoxIsOpen({ modal, inInput: false, key: 'e' })).toBe('swallow');
      expect(keyWhileABoxIsOpen({ modal, inInput: false, key: 'Escape' })).toBe('close-the-modal');
    }
  });

  it('nothing at all when no box is open', () => {
    expect(keyWhileABoxIsOpen({ modal: null, inInput: false, key: 'e' })).toBe('through');
  });
});

describe('R, on a box that is open with the caret out of it', () => {
  const aBox = (value) => {
    const box = { value, focused: false, at: null, focus() { box.focused = true; }, setSelectionRange(f, t) { box.at = [f, t]; } };
    return { box, root: { querySelector: () => box } };
  };

  it('puts the caret back after the words already typed', () => {
    const { box, root } = aBox('nearly done, one more');
    expect(focusTheReplyBox(root)).toBe(true);
    expect(box.focused).toBe(true);
    expect(box.at).toEqual([21, 21]);
  });

  it('says so when there is no box, rather than throwing', () => {
    expect(focusTheReplyBox({ querySelector: () => null })).toBe(false);
  });

  it('is what the key does when the box is already open', () => {
    expect(app).toMatch(/setModal\('reply'\); if \(modal === 'reply'\) focusTheReplyBox\(\)/);
  });
});

describe('the handler', () => {
  it('asks the rule rather than carrying its own copy of it', () => {
    expect(app).toMatch(/keyWhileABoxIsOpen/);
    expect(app).not.toMatch(/if \(modal \|\| inInput\) \{\s*\n\s*if \(e\.key === 'Escape' && !inInput\) setModal\(null\);\s*\n\s*return;/);
  });
});
