// Typing "light" in ⌘K to switch theme put five threads first and "Theme:
// Light" last, under the fold. paletteOrder (components/Palette.tsx) let a
// command go above threads only when its label STARTED with the words whenever
// a thread's title also held them ("Light theme keyboard shortcut visibility").
// That rule was for "Waits on <thread title>", which carries a thread's whole
// title; a command whose own name has the words now goes first.
import { describe, it, expect } from 'vitest';
import { paletteOrder } from '../renderer/src/components/Palette.tsx';

const cmd = (id, label, keywords = '') => ({ id, label, keywords, run: () => {} });
const thread = (id, label) => ({ id: `thread-${id}`, label, run: () => {} });
const ids = (o) => o.rows.map((r) => r.id);
const light = cmd('look-light', 'Theme: Light', 'theme appearance');
const dark = cmd('look-dark', 'Theme: Dark', 'theme appearance');
const lightThread = thread('1', 'Light theme keyboard shortcut visibility');

describe('a command named by the words goes above threads named by them too', () => {
  it('the reported case: "light" puts Theme: Light first', () => {
    expect(ids(paletteOrder([light], [lightThread, thread('2', 'Agent tray color detection')], false, 'light'))[0]).toBe('look-light');
  });
  it('"theme" puts both theme commands above the thread', () => {
    expect(ids(paletteOrder([light, dark], [lightThread], false, 'theme'))).toEqual(['look-light', 'look-dark', lightThread.id]);
  });
  it('the headings follow: Threads sits under the commands', () => {
    const { labels } = paletteOrder([light], [lightThread], false, 'light');
    expect(labels.get(0)).toBeUndefined();
    expect(labels.get(1)).toBe('Threads');
  });
});

describe('what still goes after the threads', () => {
  it('a command that carries the named thread\'s title', () => {
    const waits = cmd('wait-w-9', 'Waits on Light theme keyboard shortcut visibility', 'waits');
    expect(ids(paletteOrder([waits, light], [lightThread], false, 'light'))).toEqual(['look-light', lightThread.id, 'wait-w-9']);
  });
  it('a command the words only touch by keyword', () => {
    const look = cmd('look', 'Appearance', 'theme light dark');
    expect(ids(paletteOrder([look], [lightThread], false, 'light'))).toEqual([lightThread.id, 'look']);
  });
});
