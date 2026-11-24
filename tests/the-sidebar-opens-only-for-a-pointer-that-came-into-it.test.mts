// THE SIDEBAR OPENS ONLY FOR A POINTER THAT CAME INTO IT (w-3bfb09c6fa, 2026-11-24).
//
// On the Nov 23 onboarding call a new person "keeps opening the sidebar". The
// 2026-11-12 fix stopped a pointer that never moves from opening a sidebar drawn
// under it, but a hand on a trackpad always moves a little. Walked on the cloud
// with a pointer: pressing the ↵ end of "Start the walkthrough", or the start of
// "Skip walkthrough" or "Close", leaves the pointer where the sidebar lands next,
// and a 1px nudge then opened it. Now a move opens it only when the pointer was
// outside it the move before; a sidebar that came to the pointer stays shut
// until the pointer leaves it and comes back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { crossedIn, pointerTrail } from '../renderer/src/sidebar-shrinks.ts';

const nav = fs.readFileSync(new URL('../renderer/src/components/WorkspaceNavigation.tsx', import.meta.url), 'utf8');
// The folded sidebar as the walk measured it at the end of the walkthrough.
const rail = { left: 14, top: 32, right: 42, bottom: 878 };

describe('a pointer the sidebar slid under', () => {
  it('stays shut when nudged where Skip walkthrough was pressed', () => {
    const trail = pointerTrail();
    trail.moved(120, 860); trail.moved(34, 855);
    trail.moved(35, 855);
    expect(crossedIn(trail.before(), rail)).toBe(false);
  });
  it('stays shut on a pointer that has not moved since the window opened', () => {
    const trail = pointerTrail();
    trail.moved(30, 300);
    expect(crossedIn(trail.before(), rail)).toBe(false);
  });
});

describe('a pointer that came in', () => {
  it('opens it from the page on the right', () => {
    const trail = pointerTrail();
    trail.moved(60, 300); trail.moved(34, 300);
    expect(crossedIn(trail.before(), rail)).toBe(true);
  });
  it('opens it from the strip above, the left margin and below', () => {
    expect(crossedIn({ x: 30, y: 20 }, rail)).toBe(true);
    expect(crossedIn({ x: 6, y: 300 }, rail)).toBe(true);
    expect(crossedIn({ x: 30, y: 890 }, rail)).toBe(true);
  });
  it('opens it straight from outside the window', () => {
    const trail = pointerTrail();
    trail.moved(30, 300); trail.left(); trail.moved(20, 300);
    expect(crossedIn(trail.before(), rail)).toBe(true);
  });
  it('counts the right edge as outside and a point just inside it as in', () => {
    expect(crossedIn({ x: 42, y: 300 }, rail)).toBe(true);
    expect(crossedIn({ x: 41.5, y: 300 }, rail)).toBe(false);
  });
});

describe('the sidebar asks it', () => {
  it('follows the pointer while it is drawn', () => {
    expect(nav).toMatch(/followPointer\(/);
  });
  it('opens only once the pointer crossed in, and forgets that when it leaves', () => {
    expect(nav).toMatch(/crossedIn\(pointer\.before\(\), navBox\.current\.getBoundingClientRect\(\)\)/);
    expect(nav).toMatch(/onMouseLeave: \(\) => \{[^}]*cameIn\.current = false;/);
  });
});
