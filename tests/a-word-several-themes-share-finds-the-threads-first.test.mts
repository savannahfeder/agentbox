// A WORD SEVERAL THEMES SHARE FINDS THE THREADS FIRST (w-34443a206b).
//
// A tester on 2026-11-22 typed "dark" in ⌘K to find a thread and got three
// themes above it: Dark purple sky, Dark orange sky and Dark green sky. A
// command goes above the threads when the words start words of its name, so
// one word the three skies share put all three first. Measured on
// paletteOrder, which draws the rows.
import { describe, expect, it } from 'vitest';
import { paletteOrder } from '../renderer/src/components/Palette.tsx';

const cmd = (id: string, label: string, keywords = '') => ({ id, label, keywords, run: () => {} });
const thread = (id: string, label: string) => ({ id: `thread-${id}`, label, run: () => {} });
const ids = (o: { rows: { id: string }[] }) => o.rows.map((r) => r.id);

const skies = [
  cmd('theme-sky-purple', 'Theme: Dark purple sky', 'theme themes sky dark purple sky'),
  cmd('theme-sky-orange', 'Theme: Dark orange sky', 'theme themes sky dark orange sky'),
  cmd('theme-sky-green', 'Theme: Dark green sky', 'theme themes sky dark green sky'),
];
const darkThread = thread('1', 'Dark mode makes the tray unreadable');

describe('"dark", which all three skies start with', () => {
  it('puts the thread first and the skies under it', () => {
    expect(ids(paletteOrder(skies, [darkThread], false, 'dark'))).toEqual([darkThread.id, ...skies.map((s) => s.id)]);
  });

  it('still puts the plain Dark theme first, which it names whole', () => {
    const plain = cmd('look-dark', 'Theme: Dark', 'theme appearance');
    expect(ids(paletteOrder([plain, ...skies], [darkThread], false, 'dark'))[0]).toBe('look-dark');
  });
});

describe('words that ask for a sky', () => {
  it('picking one out puts it first', () => {
    expect(ids(paletteOrder(skies, [darkThread], false, 'dark purple'))[0]).toBe('theme-sky-purple');
  });

  it('saying sky or theme puts them all first', () => {
    expect(ids(paletteOrder(skies, [darkThread], false, 'sky')).slice(0, 3)).toEqual(skies.map((s) => s.id));
    expect(ids(paletteOrder(skies, [darkThread], false, 'dark theme')).slice(0, 3)).toEqual(skies.map((s) => s.id));
  });

  it('with no thread found, the skies are all there is', () => {
    expect(ids(paletteOrder(skies, [], false, 'dark'))).toEqual(skies.map((s) => s.id));
  });
});
