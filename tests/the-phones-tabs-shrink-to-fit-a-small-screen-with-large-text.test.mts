// THE PHONE'S TABS SHRINK TO FIT A SMALL SCREEN WITH LARGE TEXT (QA M-53,
// native Android, 2026-11-11).
//
// At 480x854, density 240 and font scale 1.3, Done sat 4px wide at the right
// edge (bounds 476-480) and a swipe did not move the row (2 of 2). At font
// scale 1.0 on the same screen every tab fit. The row only ever tightened its
// gaps. Measured from the tester's UI-tree dumps and by reading the tabs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { TABS_SMALLEST, tabsScale } from '../mobile/src/lib/tabs';

const start = { scale: 1, measuredAt: 0 };

describe('the tab words', () => {
  it('stay their size while the row fits', () => {
    expect(tabsScale({ view: 320, content: 300 }, true, start).scale).toBe(1);
  });

  it('stay their size while the gaps alone can still tighten', () => {
    expect(tabsScale({ view: 320, content: 360 }, false, start).scale).toBe(1);
  });

  it('shrink by what the tight row overflows', () => {
    const next = tabsScale({ view: 320, content: 400 }, true, start);
    expect(next.scale).toBeCloseTo(0.8, 2);
    expect(next.scale * 400).toBeLessThanOrEqual(320);
  });

  it('settle once the row fits at the smaller size, rather than growing back and overflowing again', () => {
    const first = tabsScale({ view: 320, content: 400 }, true, start);
    expect(tabsScale({ view: 320, content: 318 }, true, first)).toEqual(first);
  });

  it('never go below the smallest, leaving the row to scroll', () => {
    expect(tabsScale({ view: 200, content: 600 }, true, start).scale).toBe(TABS_SMALLEST);
  });

  it('start over at a new width', () => {
    const narrow = tabsScale({ view: 320, content: 400 }, true, start);
    expect(tabsScale({ view: 400, content: 330 }, true, narrow).scale).toBe(1);
  });

  it('are drawn at that size', () => {
    const inbox = fs.readFileSync(new URL('../mobile/src/app/index.tsx', import.meta.url), 'utf8');
    expect(inbox).toMatch(/fontSize: words\.fontSize/);
    expect(inbox).toMatch(/fontSize: words\.count/);
  });
});
