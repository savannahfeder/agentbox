// A CLICK ON A THREAD THE APP JUST OPENED WAITS FOR THE POINTER TO MOVE (F-174).
//
// QA, 2026-10-30: a pick in one thread, and a reply sent with Ctrl+Enter in
// another, each moved the app on to the next thread, and both times the
// pointer was resting on that thread's "1 Commit it and ship (recommended)".
// The click guard held for 800 ms; a second click meant for the card just left
// could land after that and commit and ship work nobody had read. Now a click
// there is refused until the pointer has moved, once, inside ten seconds.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  CLICK_FOR_THE_THREAD_YOU_LEFT, MOVED_PX, PICK_SETTLES_MS, STILL_POINTER_MS, clickAimedHere,
} from '../renderer/src/pick-settles.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const NOW = 5_000_000;
const here = 'kestrel/w-d4';
const spot = { x: 600, y: 680 };
const arrival = (ago, from = spot) => ({ key: here, at: NOW - ago, from });

describe('a click on the thread the app just moved you to', () => {
  it('is refused while the pointer stands where it stood when the thread opened', () => {
    expect(clickAimedHere(arrival(PICK_SETTLES_MS + 1), here, NOW, spot)).toBe(false);
    expect(clickAimedHere(arrival(3_000), here, NOW, { x: 602, y: 681 })).toBe(false);
  });

  it('is refused in the first moment however the pointer moved, as before', () => {
    expect(clickAimedHere(arrival(100), here, NOW, { x: 900, y: 100 })).toBe(false);
  });

  it('goes once the pointer has moved more than a few pixels', () => {
    expect(clickAimedHere(arrival(2_000), here, NOW, { x: spot.x + MOVED_PX + 1, y: spot.y })).toBe(true);
  });

  it('goes after the still spell is over, so reading for a while costs nothing', () => {
    expect(clickAimedHere(arrival(STILL_POINTER_MS), here, NOW, spot)).toBe(true);
  });

  /* ------------------------- the cases that must not match ----------------- */

  it('leaves a thread you opened yourself alone', () => {
    expect(clickAimedHere(null, here, NOW, spot)).toBe(true);
  });

  it('leaves another thread alone', () => {
    expect(clickAimedHere({ key: 'onboard/w-d4', at: NOW - 2_000, from: spot }, here, NOW, spot)).toBe(true);
  });

  it('lets the next click through once one has been refused', () => {
    expect(clickAimedHere(arrival(2_000, null), here, NOW, spot)).toBe(true);
  });

  it('does not refuse when the pointer has never been seen', () => {
    expect(clickAimedHere(arrival(2_000), here, NOW, null)).toBe(true);
  });
});

describe('the window', () => {
  it('stamps where the pointer stood when it moved you on', () => {
    expect(app).toContain('arrived.current = { key: keyOf(next.item), at: Date.now(), from: pointer.current };');
  });

  it('refuses once, says why, and lets the next click through', () => {
    expect(app).toContain('if (arrived.current) arrived.current.from = null;');
    expect(app).toContain('showToast(CLICK_FOR_THE_THREAD_YOU_LEFT);');
    expect(CLICK_FOR_THE_THREAD_YOU_LEFT).toMatch(/thread you just left/);
  });

  it('reads the pointer in screen pixels, which a made-up move after layout does not change', () => {
    expect(app).toContain('pointer.current = { x: e.screenX, y: e.screenY };');
  });
});
