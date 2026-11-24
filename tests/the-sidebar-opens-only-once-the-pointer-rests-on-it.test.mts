// THE SIDEBAR OPENS ONLY ONCE THE POINTER RESTS ON IT (w-3bfb09c6fa, 2026-11-24).
//
// On the Nov 23 onboarding call, "every time he tried to hit Needs You, the
// sidebar just opened up". Needs you sits 60 points right of the folded
// sidebar. The sidebar opened 140 ms after the pointer came in, moving or not,
// so a hand that overshot the tab into it and swung back opened it, and the
// open sidebar pushed Needs you from x 102 to x 290. Measured on the cloud with
// a pointer moved like a hand: overshoots to x 30, 26 and 22 all opened it, even
// with no pause at the turn. Now the 140 ms starts over while the pointer is
// still travelling, so it opens once the pointer rests on it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { hoverIntent, OPENS_AFTER_MS, pointerTrail, RESTS_BELOW_SPEED, stillTravelling } from '../renderer/src/sidebar-shrinks.ts';

const nav = fs.readFileSync(new URL('../renderer/src/components/WorkspaceNavigation.tsx', import.meta.url), 'utf8');
// The folded sidebar and Needs you, as measured in the inbox at 1440 by 900.
const rail = { left: 14, top: 32, right: 42, bottom: 878 };
const NEEDS_YOU: [number, number] = [126, 115];

type Sample = [t: number, x: number, y: number];
const smooth = (t: number) => 10 * t ** 3 - 15 * t ** 4 + 6 * t ** 5;
/** A hand's move: each leg eases in and out, one sample every 8 ms, with an optional stop after it. */
function hand(start: [number, number], legs: { to: [number, number]; ms: number; stop?: number }[]): Sample[] {
  const out: Sample[] = [];
  let [x, y] = start;
  let t = 0;
  for (const leg of legs) {
    const [x0, y0] = [x, y];
    const n = Math.round(leg.ms / 8);
    for (let i = 1; i <= n; i += 1) {
      t += 8;
      x = x0 + (leg.to[0] - x0) * smooth(i / n);
      y = y0 + (leg.to[1] - y0) * smooth(i / n);
      out.push([t, x, y]);
    }
    t += leg.stop ?? 0;
  }
  return out;
}
/** Runs the moves through the rule the sidebar asks, with its wait and its leave. */
function opens(samples: Sample[]): boolean {
  const trail = pointerTrail();
  const intent = hoverIntent();
  let due: number | null = null;
  let inside = false;
  for (const [t, x, y] of samples) {
    if (due !== null && t >= due) return true;
    trail.moved(x, y, t);
    const over = x >= rail.left && x < rail.right && y >= rail.top && y < rail.bottom;
    if (!over) { if (inside) { intent.left(); due = null; } inside = false; continue; }
    inside = true;
    if (intent.move(trail.before(), { x, y, t }, rail)) due = t + OPENS_AFTER_MS;
  }
  return due !== null;
}
const overshoot = (turnAt: number, stop: number) => hand([800, 400], [{ to: [turnAt, NEEDS_YOU[1]], ms: 400, stop }, { to: NEEDS_YOU, ms: 250 }]);

describe('a hand going for Needs you', () => {
  it('leaves it shut when it overshoots into the sidebar and swings straight back', () => {
    expect(opens(overshoot(30, 0))).toBe(false);
    expect(opens(overshoot(26, 0))).toBe(false);
  });
  it('leaves it shut with a short beat at the turn', () => {
    expect(opens(overshoot(26, 40))).toBe(false);
  });
  it('opens it once the hand stops on the sidebar', () => {
    expect(opens(overshoot(22, 160))).toBe(true);
  });
  it('leaves it shut passing over on the way to the window edge', () => {
    expect(opens(hand([700, 300], [{ to: [2, 300], ms: 350 }]))).toBe(false);
  });
});

describe('a hand going for the sidebar', () => {
  it('opens it on pointing at an icon and stopping', () => {
    expect(opens(hand([700, 300], [{ to: [28, 235], ms: 450 }]))).toBe(true);
  });
  it('opens it sliding slowly along the icons', () => {
    expect(opens(hand([700, 600], [{ to: [28, 600], ms: 450 }, { to: [28, 200], ms: 1400 }]))).toBe(true);
  });
  it('still never opens one that slid under the pointer and was nudged', () => {
    const intent = hoverIntent();
    expect(intent.move({ x: 34, y: 855, t: 0 }, { x: 35, y: 855, t: 16 }, rail)).toBe(false);
  });
});

describe('travelling or resting', () => {
  it('is travelling just over the speed and resting just under it', () => {
    expect(stillTravelling({ x: 0, y: 0, t: 0 }, { x: RESTS_BELOW_SPEED * 10 + 0.1, y: 0, t: 10 })).toBe(true);
    expect(stillTravelling({ x: 0, y: 0, t: 0 }, { x: RESTS_BELOW_SPEED * 10 - 0.1, y: 0, t: 10 })).toBe(false);
  });
  it('is travelling with no earlier move, or one from outside the window', () => {
    expect(stillTravelling(null, { x: 20, y: 300, t: 5 })).toBe(true);
    expect(stillTravelling({ x: -Infinity, y: -Infinity }, { x: 20, y: 300, t: 5 })).toBe(true);
  });
});

describe('the sidebar asks it', () => {
  it('starts the wait over on every move the rule says to', () => {
    expect(nav).toMatch(/if \(!intent\.move\(pointer\.before\(\), \{ x: e\.clientX, y: e\.clientY, t: e\.timeStamp \}, navBox\.current\.getBoundingClientRect\(\)\)\) return;\s+if \(hoverAt\.current\) clearTimeout\(hoverAt\.current\);\s+hoverAt\.current = setTimeout\(\(\) => onHover\(true\), OPENS_AFTER_MS\);/);
  });
  it('forgets the pointer when it leaves', () => {
    expect(nav).toMatch(/onMouseLeave: \(\) => \{[^}]*intent\.left\(\);/);
  });
});
