// A PHONE TESTER'S TAP WAITS FOR A SLIDING SHEET TO STOP (2026-11-16).
//
// 2026-11-15 workday, issue 7: "In 30 minutes" put a thread off until 6 PM,
// and the toast said "Back this evening". Rechecked 2026-11-16 against the
// preview: the More sheet's "In 30 minutes" row measured top 436 on the first
// read and 333 from 300 ms on, because each command re-applies the phone's
// screen and the sheet lays itself out again. The tool tapped at 436, two rows
// down, on "This evening". A thumb taps where the row is once it stops; the
// tool now measures until two reads agree.
import { describe, it, expect } from 'vitest';
import { settledTarget } from '../.claude/skills/product-loop/scripts/phone.mjs';

const reads = (...points: object[]) => { let i = 0; return async () => points[Math.min(i++, points.length - 1)]; };
const pause = async () => {};

describe('where a tap lands on a sheet that is still moving', () => {
  it('waits until the row stops, then taps it there', async () => {
    const at = await settledTarget({ x: 196, y: 460 }, reads({ x: 196, y: 400 }, { x: 196, y: 357 }, { x: 196, y: 357 }), pause);
    expect(at).toEqual({ x: 196, y: 357 });
  });

  it('a row that is already still is tapped where it was measured', async () => {
    let n = 0;
    const at = await settledTarget({ x: 100, y: 120 }, async () => { n++; return { x: 100, y: 120 }; }, pause);
    expect(at).toEqual({ x: 100, y: 120 });
    expect(n).toBe(1);
  });

  it('a row that ends up covered says so rather than tapping', async () => {
    expect(await settledTarget({ x: 100, y: 120 }, reads({ covered: true }), pause)).toEqual({ covered: true });
  });

  it('a row that never stops is tapped at its last place, not waited on for ever', async () => {
    let y = 0;
    const at = await settledTarget({ x: 1, y: 0 }, async () => ({ x: 1, y: (y += 10) }), pause, 5);
    expect(at).toEqual({ x: 1, y: 50 });
  });
});
