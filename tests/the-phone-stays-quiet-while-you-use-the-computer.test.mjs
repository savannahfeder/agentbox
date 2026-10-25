// THE PHONE STAYS QUIET WHILE YOU USE THE COMPUTER (2026-10-13).
//
// Reported: "Even when I'm not using the mobile version of the app (let's say
// I stopped using it because I'm back on my laptop), it's still sending me tons
// and tons of notifications."
//
// The phone used the desktop banner's rule, which counts you as away whenever
// the Agentbox window is not the front one. Working in a browser or an editor
// on the laptop was "away", so the phone buzzed, and every trip back to the
// Agentbox window started a new stretch that could buzz it again. The desktop
// banner already covers someone at the computer in another app; the phone is
// for someone who has left the computer, which the machine's idle clock says
// and the window's focus does not.

import { describe, it, expect } from 'vitest';
import { atTheComputer, atTheApp, AWAY_AFTER_MS } from '../shared/notify-rules.mjs';

describe('at the computer, for the phone', () => {
  it('typing in another app is at the computer', () => {
    expect(atTheComputer({ idleMs: 0 })).toBe(true);
  });

  it('a second short of the away mark is still at the computer', () => {
    expect(atTheComputer({ idleMs: AWAY_AFTER_MS - 1000 })).toBe(true);
  });

  it('at the away mark and past it, you have left', () => {
    expect(atTheComputer({ idleMs: AWAY_AFTER_MS })).toBe(false);
    expect(atTheComputer({ idleMs: AWAY_AFTER_MS * 6 })).toBe(false);
  });

  it('the desktop banner keeps its own rule: another app in front is not at the app', () => {
    expect(atTheApp({ focused: false, idleMs: 0 })).toBe(false);
  });
});
