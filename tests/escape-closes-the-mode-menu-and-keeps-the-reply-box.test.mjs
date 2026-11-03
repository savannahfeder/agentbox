// Escape did not close the permission mode menu in the reply box (Manual,
// Accept edits, Plan, Auto, Don't Ask, Bypass Permissions). Measured in the
// built renderer driven by real key and mouse events, after R and some typed
// words: with the caret left in the box, Escape only blurred the box and the
// menu stayed open; with focus on the mode word, Escape went to the window's
// handler, which folded the whole reply box. The menu had no Escape of its
// own, unlike the priority menu beside it and the thread's Files menu.
// Pressed here through the listener the menu installs while it is open.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { escapeClosesMenu } from '../renderer/src/menu-escape.ts';
import { keyWhileABoxIsOpen } from '../renderer/src/keys.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

function fakeWindow() {
  const on = [];
  return {
    addEventListener: (type, fn, capture) => on.push({ type, fn, capture }),
    removeEventListener: (type, fn, capture) => { const i = on.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture); if (i >= 0) on.splice(i, 1); },
    press(key, target) {
      const marks = { prevented: false, stopped: false };
      const e = { key, target, preventDefault() { marks.prevented = true; }, stopImmediatePropagation() { marks.stopped = true; }, stopPropagation() { marks.stopped = true; } };
      for (const l of on.filter((x) => x.type === 'keydown' && x.capture)) l.fn(e);
      return marks;
    },
    listening: () => on.length,
  };
}
const textarea = { tagName: 'TEXTAREA' };
const modeWord = { tagName: 'BUTTON' };

describe('Escape with the mode menu open', () => {
  it('closes it with the caret still in the reply box, and the box never hears it', () => {
    const w = fakeWindow();
    let closed = 0;
    escapeClosesMenu(w, () => { closed += 1; });
    expect(w.press('Escape', textarea)).toEqual({ prevented: true, stopped: true });
    expect(closed).toBe(1);
  });

  it('closes it with focus on the mode word, before the window would fold the box', () => {
    expect(keyWhileABoxIsOpen({ modal: 'reply', inInput: false, key: 'Escape' })).toBe('close-the-modal');
    const w = fakeWindow();
    let closed = 0;
    escapeClosesMenu(w, () => { closed += 1; });
    expect(w.press('Escape', modeWord)).toEqual({ prevented: true, stopped: true });
    expect(closed).toBe(1);
  });

  it('leaves every other key alone', () => {
    const w = fakeWindow();
    let closed = 0;
    escapeClosesMenu(w, () => { closed += 1; });
    for (const key of ['a', 'Enter', 'ArrowDown', 'Tab']) expect(w.press(key, textarea)).toEqual({ prevented: false, stopped: false });
    expect(closed).toBe(0);
  });

  it('and once the menu has closed, Escape is the box\'s again', () => {
    const w = fakeWindow();
    let closed = 0;
    const off = escapeClosesMenu(w, () => { closed += 1; });
    off();
    expect(w.listening()).toBe(0);
    expect(w.press('Escape', textarea)).toEqual({ prevented: false, stopped: false });
    expect(closed).toBe(0);
  });

  it('is what the mode menu installs while it is open', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    const picker = focus.slice(focus.indexOf('function ModePicker('), focus.indexOf('function DockComposer('));
    expect(picker).toMatch(/useEffect\(\(\) => \(open \? escapeClosesMenu\(window, \(\) => \{ setOpen\(false\); onEscape\?\.\(\); \}\) : undefined\), \[open\]\);/);
  });
});
