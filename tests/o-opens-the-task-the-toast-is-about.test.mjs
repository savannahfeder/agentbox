// O OPENS THE TASK THE TOAST IS ABOUT.
//
// w-f0bfe32859: "I very often, after submitting a task, click 'Open it' in the
// toast ... having a keyboard shortcut for that would be very nice." The toast
// after a send or an answer carried a way in for the mouse only: six seconds to
// notice it, reach the trackpad and land on a 13px phrase. Z already undid what
// that toast announced from the keyboard; nothing went the other way.
//
// Measured before the fix: no branch of the window key handler in App.tsx read
// 'o' at all, so pressing O with the toast up did nothing.
//
// The rule is pure (renderer/src/toast-parts.ts) and the wiring is checked by
// excerpt, the way the shortcuts page test does it, because there is no render
// harness for App.tsx.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { opensTheToast } from '../renderer/src/toast-parts';
import { OPENS_A_TEXT_FIELD } from '../renderer/src/keys';
import { CHANGE_OWNS } from '../renderer/src/code-keys';
import { SHORTCUTS } from '../renderer/src/shortcuts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const goes = { product: 'agentbox', id: 'w-1' };

describe('which presses open the toast’s task', () => {
  it('O opens it, either case', () => {
    expect(opensTheToast('o', { goes })).toEqual(goes);
    expect(opensTheToast('O', { goes })).toEqual(goes);
  });

  it('a toast with nowhere to go opens nothing', () => {
    // "Priority: high" is an announcement; O must not be eaten by it.
    expect(opensTheToast('o', {})).toBeNull();
    expect(opensTheToast('o', { goes: undefined })).toBeNull();
  });

  it('no toast on screen, nothing to open', () => {
    // Once it has faded the key is dead again rather than reaching back to a
    // task she can no longer see named anywhere.
    expect(opensTheToast('o', null)).toBeNull();
  });

  it('the neighbouring keys do not open it', () => {
    for (const k of ['p', 'i', '0', 'Enter', 'z', 'Z']) expect(opensTheToast(k, { goes })).toBeNull();
  });
});

describe('the window handler answers O', () => {
  const HANDLER = app.indexOf('    const onKey = (e: KeyboardEvent) => {');
  const FOCUSED = app.indexOf('      if (focused) {');
  const before = app.slice(HANDLER, FOCUSED);

  it('above the split between an open task and the list, so it works in both', () => {
    expect(before).toContain('const goesTo = opensTheToast(e.key, toast);');
    expect(before).toContain('if (goesTo) { e.preventDefault(); openToastRow(goesTo); return; }');
  });

  it('after the typing and modal guard, so an O typed in a box stays an O', () => {
    const guard = before.indexOf('if (modal || inInput) {');
    expect(guard).toBeGreaterThan(-1);
    expect(before.indexOf('opensTheToast(e.key, toast)')).toBeGreaterThan(guard);
  });

  it('the click and the key open the row the same way', () => {
    expect(app).toContain('const openToastRow = useCallback((to: ToastGoes) => {');
    expect(app).toMatch(/onClick=\{\(\) => openToastRow\(toast\.goes!\)\}/);
  });

  it('O is not a key that opens a field, and an open change does not own it', () => {
    expect(OPENS_A_TEXT_FIELD.has('o')).toBe(false);
    expect(CHANGE_OWNS.has('o')).toBe(false);
  });

  it('the shortcuts page lists it', () => {
    const all = SHORTCUTS.flatMap((g) => g.keys);
    expect(all.find((k) => k.keys.includes('O'))?.what).toMatch(/^Open the task you just sent or answered/);
  });
});
