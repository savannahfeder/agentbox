// V SWITCHES BETWEEN THE LIST AND THE BOARD (w-58c8f466e7, 2026-10-02).
//
// Asked for in so many words: "I quite often switch between board and list
// view, can you give me a shortcut to do so?" The switch lived two clicks
// deep, as the first row of the View and filters menu, and no key reached it:
// the tutorial's own board card was pinned as naming no key "because the app
// has no shortcut that opens the menu". Measured before the change: no `case
// 'v'` anywhere in App.tsx's key handler, no V on the shortcuts page, and no
// row for it in ⌘K.
//
// V because the menu it replaces is headed View, and because it was free: B
// was a real key once (gated on an empty inbox) and is pinned dead by the
// shortcuts page's own test, so it is not brought back for this.
//
// WHAT THIS FILE HOLDS. One press flips the view and keeps every filter; it
// works where the list or the board is on the screen and nowhere else; ⌘V is
// still paste; and the three places that teach keys (the shortcuts page, ⌘K
// and the tutorial's board card) all name it.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flipView } from '../renderer/src/threads/page-rules.ts';
import { SHORTCUTS } from '../renderer/src/shortcuts.ts';
import { coach, wrongPress } from '../renderer/src/onboarding.ts';
import { opensATextField } from '../renderer/src/keys.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const palette = read('renderer/src/components/Palette.tsx');

// The key handler cut the way the shortcuts page's test cuts it.
const HANDLER = app.indexOf('    const onKey = (e: KeyboardEvent) => {');
const FOCUSED = app.indexOf('      if (focused) {', HANDLER);
const LIST = app.indexOf('      switch (e.key) {', HANDLER);
const END = app.indexOf("    window.addEventListener('keydown', onKey);", HANDLER);
const focused = app.slice(FOCUSED, LIST);
const list = app.slice(LIST, END);

const display = (view) => ({ view, sort: 'updated', priorities: ['high'], projects: ['p1'], updated: 'week' });

describe('one press flips the view', () => {
  it('turns the list into the board', () => {
    expect(flipView(display('list')).view).toBe('board');
  });

  it('turns the board back into the list', () => {
    expect(flipView(display('board')).view).toBe('list');
  });

  it('keeps the sort and every filter, so only the shape changes', () => {
    // The boundary: a flip that reset the filters would show different work in
    // the other view, and the two views are meant to be the same threads.
    const { view: _a, ...before } = display('list');
    const { view: _b, ...after } = flipView(display('list'));
    expect(after).toEqual(before);
  });

  it('two presses put you back where you started', () => {
    expect(flipView(flipView(display('board')))).toEqual(display('board'));
  });
});

describe('where V works', () => {
  it('is answered in the list, by flipping the display the page is drawn in', () => {
    expect(list).toContain("case 'v': case 'V':");
    expect(list).toContain('setInboxDisplay(flipView(inboxDisplay))');
  });

  it('does nothing with a search up, on the Team page, or on an open card', () => {
    // Each of those draws something other than the list or the board, so a
    // flip there would change a screen she cannot see.
    const branch = list.slice(list.indexOf("case 'v': case 'V':"), list.indexOf('break;', list.indexOf("case 'v': case 'V':")));
    expect(branch).toContain('search === null');
    expect(branch).toContain('!teamShown');
    expect(branch).toContain('!openCard');
  });

  it('does nothing inside an open task', () => {
    // THE CASE THAT MUST NOT MATCH. The board is behind the task, so a flip
    // there is invisible until she backs out and finds the page changed.
    expect(focused).not.toMatch(/'v'|'V'/);
  });

  it('leaves ⌘V to paste', () => {
    // Every modifier chord returns before the list switch is reached.
    const guard = app.indexOf('      if (e.metaKey || e.ctrlKey || e.altKey) return;', HANDLER);
    expect(guard).toBeGreaterThan(HANDLER);
    expect(guard).toBeLessThan(LIST);
  });

  it('opens no text field, so it has no keystroke to swallow', () => {
    expect(opensATextField('v')).toBe(false);
  });
});

describe('everywhere that teaches keys names it', () => {
  it('is on the shortcuts page, under the inbox, in one short sentence', () => {
    const inbox = SHORTCUTS.find((g) => g.label === 'In your inbox');
    const row = inbox.keys.find((k) => k.keys.includes('V'));
    expect(row).toBeTruthy();
    expect(row.what.toLowerCase()).toContain('list');
    expect(row.what.toLowerCase()).toContain('board');
  });

  it('is a row in ⌘K with V beside it', () => {
    expect(palette).toMatch(/id: 'flip-view',[\s\S]{0,200}keyHint: 'V',/);
    expect(palette).toContain("boardUp ? 'Show as a list' : 'Show as a board'");
  });

  it('is named on the tutorial’s board card, beside the click', () => {
    const say = coach('board', 0);
    expect(say.key).toBe('V');
    const line = `${say.lead}${say.key}${say.tail}`.toLowerCase();
    expect(line).toContain('view and filters');
    expect(line).toContain('board');
  });

  it('is the one key the board card lets through', () => {
    // The walk swallows any key that is not the card's own. V must reach the
    // app on this card, and a neighbouring letter must still be held.
    expect(wrongPress('V', { key: 'v' })).toBe(false);
    expect(wrongPress('V', { key: 'V' })).toBe(false);
    expect(wrongPress('V', { key: 'b' })).toBe(true);
    // ⌘V is not an answer to the walk at all, right or wrong.
    expect(wrongPress('V', { key: 'v', metaKey: true })).toBe(false);
  });
});
