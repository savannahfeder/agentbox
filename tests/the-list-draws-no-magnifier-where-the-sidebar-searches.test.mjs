// THE LIST DRAWS NO MAGNIFIER WHERE THE SIDEBAR SEARCHES (w-33611c2122).
//
// Once ⌘K found threads and the sidebar's Search row opened it, the
// magnifier at the right end of the Needs you / In progress row (and in the
// board's header) was a second way to the same place. Measured in App.tsx:
// both StateTabs and, on the board, HeaderActions were handed `openSearch`
// on every screen. A phone has no sidebar and no ⌘K key, so there the
// magnifier stays, and it opens ⌘K (command-k-on-a-phone).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

/** Every `<Name` element in App.tsx, from its tag to its self-closing `/>`. */
const elements = (name) => {
  const out = [];
  for (let at = app.indexOf(`<${name}`); at > -1; at = app.indexOf(`<${name}`, at + 1)) {
    if (!/[\s]/.test(app[at + name.length + 1])) continue;
    out.push(app.slice(at, app.indexOf('/>', at)));
  }
  return out;
};

describe('the list and the board leave search to the sidebar', () => {
  it('is drawn only on a phone', () => {
    expect(app).toMatch(/const searchInTheList = onPhone\(\) \? \(\) => setModal\('palette'\) : undefined;/);
  });

  it('no tab row is handed a search of its own', () => {
    const tabs = elements('StateTabs');
    expect(tabs.length).toBeGreaterThanOrEqual(1);
    for (const t of tabs) expect(t).not.toMatch(/onSearch=/);
  });

  it('the inbox header is handed only that', () => {
    const header = elements('HeaderActions').find((h) => h.includes('page="inbox"'));
    expect(header).toMatch(/onSearch=\{searchInTheList\}/);
  });

  it('still opens the full search from ⌘K and the / key', () => {
    const palette = elements('Palette')[0];
    expect(palette).toMatch(/onSearch=\{openSearch\}/);
    expect(palette).toMatch(/onSearchFor=\{searchFor\}/);
  });
});
