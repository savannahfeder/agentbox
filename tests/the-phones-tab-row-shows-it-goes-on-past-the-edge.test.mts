// THE PHONE'S TAB ROW SHOWS IT GOES ON PAST THE EDGE (QA M-33, 2026-11-04).
//
// On a 320 dp wide Android screen the inbox's Done tab sat past the right
// edge with about 11 px showing. The row scrolled sideways, but nothing said
// so. Measured from the UI tree at 480x854, 240 dpi. A row that does not fit
// now closes up its gaps, which fits the four tabs at 320 wide; one that still
// does not fit fades out at its right edge while there is more to scroll to.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { moreToTheRight, tabsTighten } from '../mobile/src/lib/tabs';

describe('whether the tabs close up their gaps', () => {
  const four = { tabs: 4, counted: 2 };
  // Four tabs, two counts: tight saves 3 * 10 + 2 * 7 = 44 px.
  it('stays loose when the loose row fits, or exactly fits', () => {
    expect(tabsTighten({ view: 402, content: 349 }, false, four)).toBe(false);
    expect(tabsTighten({ view: 349, content: 349 }, false, four)).toBe(false);
  });
  it('closes up when the loose row runs past the edge', () => {
    expect(tabsTighten({ view: 320, content: 349 }, false, four)).toBe(true);
  });
  it('stays tight once tight, while the loose row would still not fit', () => {
    expect(tabsTighten({ view: 320, content: 305 }, true, four)).toBe(true);
  });
  it('opens up again when the screen grows to fit the loose row', () => {
    expect(tabsTighten({ view: 402, content: 305 }, true, four)).toBe(false);
  });
  it('keeps what it had before the row is measured', () => {
    expect(tabsTighten({ view: 0, content: 0 }, true, four)).toBe(true);
    expect(tabsTighten({ view: 0, content: 0 }, false, four)).toBe(false);
  });
});

describe('whether the tab row fades at its right edge', () => {
  it('fades when the tabs run past the edge', () => {
    expect(moreToTheRight({ view: 320, content: 360, x: 0 })).toBe(true);
  });
  it('fades until the last few pixels are scrolled into view', () => {
    expect(moreToTheRight({ view: 320, content: 360, x: 30 })).toBe(true);
    expect(moreToTheRight({ view: 320, content: 360, x: 39 })).toBe(false);
    expect(moreToTheRight({ view: 320, content: 360, x: 40 })).toBe(false);
  });
  it('does not fade when everything fits, or exactly fits', () => {
    expect(moreToTheRight({ view: 402, content: 360, x: 0 })).toBe(false);
    expect(moreToTheRight({ view: 360, content: 360, x: 0 })).toBe(false);
  });
  it('does not fade before the row has been measured', () => {
    expect(moreToTheRight({ view: 0, content: 0, x: 0 })).toBe(false);
  });
});

describe('the inbox tabs', () => {
  it('draw the fade from that rule', () => {
    const src = fs.readFileSync(new URL('../mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const tabs = src.slice(src.indexOf('function Tabs'), src.indexOf('function Outlined'));
    expect(tabs).toMatch(/moreToTheRight\(/);
    expect(tabs).toMatch(/tabsTighten\(/);
    expect(tabs).toMatch(/onScroll/);
  });
});
