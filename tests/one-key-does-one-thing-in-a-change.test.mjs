// ONE KEY DOES ONE THING WHILE A CHANGE IS OPEN.
//
// The arrows were round one.
//
// A key pressed at the change is pressed at the WINDOW, and App.tsx listens on
// the window too. Both handlers ran on the same press. Measured: with the
// change open, J walked to the next FILE in the pane and to the next TASK in
// the app, in one keystroke, and the change she was reading was replaced by
// another card's document. Round one's fixture had a single row, so "go to the
// next task" had nowhere to go and the fault could not show.
//
// The arrows are the same fault on another surface: ArrowDown scrolled the code
// AND moved the selected option on the card, so reading a diff quietly armed an
// answer she had not chosen.
//
// The rule is applied ONCE, to the key, above every branch that could act on
// it. renderer/src/keys.ts carries the story of why fixing branches instead is
// how the second branch gets missed.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGE_OWNS, changeOwnsKey } from '../renderer/src/code-keys.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const app = read('renderer', 'src', 'App.tsx');

describe('the keys a change answers itself', () => {
  it('claims every key the change acts on', () => {
    // The arrows and the paging keys it scrolls with, and the ends.
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']) {
      expect(changeOwnsKey(key)).toBe(true);
    }
  });

  it('claims J and K as well, and spends them on NOTHING', () => {
    // The app's J means "next task". Hand these back and a J pressed over a
    // change closes the code she is reading and brings up a different card:
    // round two's fault, arriving through the door marked "removal". Owned and
    // inert is the whole of it, and it is why CHANGE_OWNS is still 10 long
    // while walkFiles is two cases shorter.
    expect(changeOwnsKey('j')).toBe(true);
    expect(changeOwnsKey('k')).toBe(true);
    expect(changeOwnsKey('J')).toBe(true);
    expect(changeOwnsKey('K')).toBe(true);
    const rules = read('renderer', 'src', 'code-keys.ts');
    expect(rules).not.toMatch(/case 'j'/);
    expect(rules).not.toMatch(/case 'k'/);
  });

  it('leaves her every way out and every way to answer', () => {
    // Escape steps back out of the pane, E archives, R replies, C composes, Z
    // takes the last one back, Enter and the numbers pick an option. Taking any
    // of these would cost her something real to fix something that is not
    // broken: the change does not answer them.
    for (const key of ['Escape', 'e', 'E', 'r', 'R', 'c', 'C', 'z', 'Z', 's', 'S', 'Enter', '1', '2', '9', '/', '\\']) {
      expect(changeOwnsKey(key)).toBe(false);
    }
  });

  it('is one set, not a list copied into the app', () => {
    // Twelve since 2026-10-04: ] and [ walk the changes
    // (tests/the-next-change-is-one-key-away.test.mjs).
    expect(CHANGE_OWNS.size).toBe(12);
  });
});

describe('the app stands down for them', () => {
  it('asks code-keys.ts rather than naming the keys again', () => {
    expect(app).toContain("import { changeOwnsKey } from './code-keys'");
    expect(app).toMatch(/docKind\(openDoc\?\.src\) === 'code' && changeOwnsKey\(e\.key\)/);
  });

  it('asks BEFORE the branches that would act on the same press', () => {
    // Placement is the whole fix. Below the arrow branch it would change
    // nothing at all, because the option selection has already moved by then.
    const guard = app.indexOf("changeOwnsKey(e.key)) return;");
    const arrows = app.indexOf("else if (e.key === 'ArrowDown' && opts.length)");
    const walk = app.indexOf("else if (e.key === 'j' || e.key === 'J'");
    expect(guard).toBeGreaterThan(0);
    expect(arrows).toBeGreaterThan(guard);
    expect(walk).toBeGreaterThan(guard);
  });

  it('only stands down for a change, not for every open document', () => {
    // A markdown file or a page in the pane draws no CodeArtifact, so nothing
    // else is listening and the app must keep its own keys there.
    expect(app).toContain("docKind(openDoc?.src) === 'code'");
  });

  it('leaves escape alone, so one step back is still one step back', () => {
    expect(app).toMatch(/if \(e\.key === 'Escape'\) \{ if \(escapeClosesDoc\(openDoc\)\)/);
  });
});
