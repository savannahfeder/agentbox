// A LETTER ON A PICKED CELL GOES TO THE APP, NOT INTO THE CELL.
//
// With a table cell picked, typing started an edit, as in Airtable. Testers
// pressed R to reply and five times the reply went into a cell instead, over a
// date or a company name, and was never sent. The person chose the other way:
// Enter, F2 or a double click starts an edit, and a single letter is handed on
// from the table itself, which is no text box, so R, E, J and K act as they do
// everywhere else. Asserted on the source: the keys reach a hidden box in the
// table, and what that box does with a letter is the whole of the rule.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { strayLetters, installStrayLetters } from '../renderer/src/stray-letters.ts';

const src = fs.readFileSync(new URL('../renderer/src/components/TableView.tsx', import.meta.url), 'utf8');
const onKeys = src.slice(src.indexOf('const onKeys = '), src.indexOf('const onCopy = '));

it('a letter typed on a picked cell does not start an edit', () => {
  expect(onKeys).not.toMatch(/startEdit\(pick\.a, k\)/);
});

it('the letter is handed on from the table, where the app\'s own keys hear it', () => {
  expect(onKeys).toMatch(/k\.length === 1[^\n]*\n?[^\n]*passKey\(e\)/);
  const passKey = src.slice(src.indexOf('const passKey = '), src.indexOf('const passEscape = '));
  expect(passKey).toMatch(/root\.current\?\.dispatchEvent\(new KeyboardEvent\('keydown'/);
});

it('Enter, F2 and a double click still edit', () => {
  expect(onKeys).toMatch(/if \(k === 'Enter'\)[\s\S]*?startEdit\(pick\.a\)/);
  expect(onKeys).toMatch(/if \(k === 'F2'\) \{ stop\(\); startEdit\(pick\.a\); return; \}/);
  expect(src).toMatch(/if \(hit\.kind === 'cell'\) \{ e\.preventDefault\(\); startEdit\(hit\.at\); \}/);
});

it('text arriving with no key press (dictation, a picker) does not start an edit either', () => {
  const change = src.slice(src.indexOf('className="tbl-keys"'), src.indexOf('className="tbl-scroll"'));
  expect(change).not.toMatch(/startEdit/);
});

// The app's guard sends a letter that follows typing back to the box typed in.
// The table's key box counted as one, so the R it handed on went straight back
// to the table and the reply box never opened. Measured on a fake window.
it('the stray-letter guard does not count the table\'s key box as typing', () => {
  strayLetters.reset();
  const heard = [];
  const win = { addEventListener: (t, fn) => { if (t === 'keydown') heard.push(fn); }, removeEventListener: () => {}, document: { querySelector: () => null } };
  const off = installStrayLetters(win);
  const keyBox = { tagName: 'TEXTAREA', isContentEditable: false, dataset: { keysOnly: '' }, isConnected: true, getClientRects: () => [1], focus() { win.focused = keyBox; }, matches: () => false, closest: () => null };
  const table = { tagName: 'DIV', isContentEditable: false, dataset: {}, isConnected: true, getClientRects: () => [1], matches: () => false, closest: () => null };
  const press = (key, target) => {
    const e = { key, target, metaKey: false, ctrlKey: false, altKey: false, stopped: false, stopImmediatePropagation() { e.stopped = true; }, preventDefault() {} };
    heard.forEach((fn) => fn(e));
    return e;
  };
  press('r', keyBox);
  const handedOn = press('r', table);
  expect(handedOn.stopped).toBe(false);
  expect(win.focused).toBeUndefined();
  off();
});
