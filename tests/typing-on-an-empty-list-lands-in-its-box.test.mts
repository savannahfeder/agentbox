// A power tester on 2026-11-04 replied to the last thread in Needs you, landed
// on "Nothing needs you" with its "What do you need done?" box, typed "list
// every endpoint in the payments api..." and pressed send: nothing was sent and
// all 79 characters were gone. Reproduced in a test copy: on the empty list,
// "list every endpoint" and "explain the build" left the box empty while "add
// a health check" landed. L and E were taken as Later and Done with no thread
// to act on, and the letters after them went nowhere. With no row and nothing
// ticked, the keys that act on a row now go to the box; Z, N, / and the rest
// stay shortcuts, so Z still undoes closing the last thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { keyOnTheList } from '../renderer/src/reply-keys';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('a letter on a list with no thread to act on', () => {
  it('goes to the box when it would act on a row', () => {
    for (const key of ['e', 'l', 'j', 'k', 'r', 'E', 'L', '1', '2']) {
      expect(keyOnTheList({ key, justChanged: false, nothingToActOn: true })).toBe('nowhere');
    }
  });

  it('stays a shortcut when it needs no row', () => {
    for (const key of ['z', 'n', 'g', 'b', 'o', 'i', 'Enter', 'Escape']) {
      expect(keyOnTheList({ key, justChanged: false, nothingToActOn: true })).toBe('shortcut');
    }
  });

  it('is unchanged with a row to act on', () => {
    expect(keyOnTheList({ key: 'e', justChanged: false, nothingToActOn: false })).toBe('shortcut');
    expect(keyOnTheList({ key: 'l', justChanged: true })).toBe('held');
    expect(keyOnTheList({ key: 'j', justChanged: false })).toBe('shortcut');
  });

  it('is told by the window when there is no row, card or tick, or Home covers them', () => {
    expect(app).toContain('const nothingToActOn = !focused && !pointed && (listCovered || (!multiSel.size && !keyLead && !stops.length));');
    expect(app).toContain('keyOnTheList({ key: e.key, justChanged: screenJustChanged(screenChangedAt.current, Date.now()), nothingToActOn })');
  });

  // R and L open a text field elsewhere, so their keystroke is swallowed ahead
  // of every branch; on an empty list that swallowed the first letter of a word.
  it('keeps R and L as letters on an empty list', () => {
    expect(app).toContain('if (opensATextField(e.key) && !(nothingToActOn && actsOnARow(e.key))) e.preventDefault();');
  });
});
