// A WORD INSIDE A TABLE CELL TAKES A COMMENT (w-2e26d0fb44).
//
// What was asked, on the first round's screenshots: "what if i want to comment
// on a particular word in a text field?" A cell took a comment only as a whole.
// Opening its text (double-click or Enter) and selecting words showed no
// Comment bar, because Chrome reports a selection inside a text box as one on
// the page's body, which the bar never counted as the page's. Measured in
// Chromium: selecting 4 letters in a textarea gave a selection anchored on
// BODY. Now the bar reads the focused box's own selection, and the note keeps
// both the words and the cell they were in.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { boxPickedIn } from '../renderer/src/selection-bar.ts';
import { cellAround } from '../renderer/src/paint-quotes.ts';
import { placeWords } from '../shared/artifact-marks.mts';

const read = (p: string) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

const box = (value: string, a: number | null, b: number | null) => ({ value, selectionStart: a, selectionEnd: b });
const inside = { contains: () => true };
const outside = { contains: () => false };

describe('words selected in a cell\'s text box', () => {
  it('are the box\'s own selection', () => {
    expect(boxPickedIn(inside, box('Orchard Pay booked a demo on Friday', 21, 25))).toBe('demo');
  });
  it('are nothing when only the caret is there, or only spaces', () => {
    expect(boxPickedIn(inside, box('Orchard Pay', 3, 3))).toBeNull();
    expect(boxPickedIn(inside, box('a   b', 1, 4))).toBeNull();
  });
  it('are nothing in a box off the page, or in something that is not a box', () => {
    expect(boxPickedIn(outside, box('Orchard Pay', 0, 7))).toBeNull();
    expect(boxPickedIn(inside, box('Orchard Pay', null, null))).toBeNull();
    expect(boxPickedIn(inside, null)).toBeNull();
    expect(boxPickedIn(null, box('Orchard Pay', 0, 7))).toBeNull();
  });
});

describe('the cell the words are in', () => {
  const at = (attrs: Record<string, string> | null) => ({ closest: () => (attrs ? { getAttribute: (k: string) => attrs[k] ?? null } : null) });
  it('is read off the box or the cell around them', () => {
    expect(cellAround(at({ 'data-row': '4', 'data-col': 'Next step' }))).toEqual({ row: 4, column: 'Next step' });
  });
  it('is none outside a table, or with no row worth the name', () => {
    expect(cellAround(at(null))).toBeUndefined();
    expect(cellAround(at({ 'data-row': '0', 'data-col': 'Next step' }))).toBeUndefined();
    expect(cellAround(at({ 'data-row': '4', 'data-col': '' }))).toBeUndefined();
    expect(cellAround(null)).toBeUndefined();
  });
  it('is told to the agent after the words', () => {
    expect(placeWords({ place: { kind: 'quote', text: 'demo', cell: { row: 4, column: 'Next step' } } })).toBe('“demo” in row 4, Next step');
  });
});

describe('wired through', () => {
  it('the bar counts a box\'s selection as the page\'s, and says where it is', () => {
    const bar = read('components/SelectionBar.tsx');
    expect(bar).toContain('boxPickedIn(page.current, document.activeElement)');
    expect(bar).toMatch(/onComment\(quoteFrom\(words\), at\)/);
  });
  it('the open cell box carries its file row and column', () => {
    expect(read('components/TableView.tsx')).toMatch(/className="tbl-edit" data-row=\{order\[editing\.r\] \+ 1\} data-col=\{table\.columns\[editing\.c\]\.name\}/);
  });
  it('both tables\' comment boxes take the cell with the words', () => {
    expect(read('components/NotesSidebar.tsx')).toContain('setQuote({ text: q, cell: cellAround(at) })');
    expect(read('components/ArtifactStage.tsx')).toContain("onPlace({ kind: 'quote', text: quote, cell: cellAround(at) })");
  });
  it('closing the box does not pull the keys back from the note box', () => {
    expect(read('components/TableView.tsx')).toContain('if (at && at !== keys.current && typingIn(at) && !root.current?.contains(at)) return;');
  });
  it('the bar sits over the file viewer however the styles load', () => {
    // Measured: in the built app the bar drew at z-index 60, under the viewer's 9400, because .link-pop loaded later.
    expect(fs.readFileSync(new URL('../renderer/src/components/artifact-view.css', import.meta.url), 'utf8')).toContain('.link-pop.selection-bar { z-index: 9450;');
  });
  it('the words are lit inside their own cell', () => {
    expect(read('paint-quotes.ts')).toMatch(/const cell = textIn\(el\);\s*const hit = findQuote\(cell\.words, q\.text\);\s*if \(hit\) return rangeOf\(cell, hit\);/);
  });
});
