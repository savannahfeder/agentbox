// WHAT SHE PRESSES IS LOOKED AT NOW, NOT AT THE NEXT TICK.
//
// Measured against a real Supervisor and a real Store with the spawn stubbed,
// the same afternoon: median 7.0s to a spawn on a new task, median 9.1s on a
// reply, worst 15.0s. Claude Code's own start on a trivial prompt is 0.7s, and
// its first word is 3.6 to 5.9s in, so most of the wait before anything
// happened at all was the app sitting still, and it was paid twice per round
// trip.
//
// These are the properties that stop it coming back, and they are about the
// wake itself rather than about wall-clock speed: a test that asserts a number
// of milliseconds would be a test about the machine it runs on.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

const sup = (over = {}) => Object.assign(Object.create(Supervisor.prototype), {
  paused: false,
  _wakeTimer: null,
  _ticking: false,
  _tickAgain: false,
  _lastTickAt: 0,
  _timer: null,
  sessions: new Map(),
  ticks: 0,
}, over);

beforeEach(() => { vi.useFakeTimers(); });

describe('her press wakes the fleet', () => {
  it('looks within a fraction of a second, not at the next tick', async () => {
    const s = sup();
    s.tick = async () => { s.ticks += 1; };
    s.wake();
    expect(s.ticks).toBe(0);          // not synchronously, so a burst can settle
    await vi.advanceTimersByTimeAsync(1_100);
    expect(s.ticks).toBe(1);
    // And nowhere near the fifteen second timer this replaces.
    expect(s.ticks).toBe(1);
  });

  it('a burst of presses is one pass, not one each', async () => {
    const s = sup();
    s.tick = async () => { s.ticks += 1; };
    for (let i = 0; i < 50; i++) s.wake();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(s.ticks).toBe(1);
  });

  it('holding the fleet awake cannot spin it faster than the floor', async () => {
    const s = sup();
    s.tick = async () => { s.ticks += 1; s._lastTickAt = Date.now(); };
    // Ten seconds of pressing something every 50ms.
    for (let i = 0; i < 200; i++) { s.wake(); await vi.advanceTimersByTimeAsync(50); }
    expect(s.ticks).toBeLessThanOrEqual(11);
  });

  it('two passes never run beside each other', async () => {
    const s = sup();
    let inside = 0, most = 0;
    s._tick = async () => {
      inside += 1; most = Math.max(most, inside);
      await new Promise((r) => setTimeout(r, 500));
      inside -= 1;
    };
    const a = s.tick();
    const b = s.tick();
    await vi.advanceTimersByTimeAsync(2_000);
    await Promise.all([a, b]);
    expect(most).toBe(1);
  });

  it('a press that lands mid-pass is served after it, not thrown away', async () => {
    const s = sup();
    const ran = [];
    s._tick = async () => { ran.push('pass'); await new Promise((r) => setTimeout(r, 500)); };
    const running = s.tick();
    await vi.advanceTimersByTimeAsync(100);
    s.wake();                          // she presses while the pass is running
    await vi.advanceTimersByTimeAsync(3_000);
    await running;
    expect(ran.length).toBe(2);
  });

  it('quitting cancels a wake rather than spawning one more worker', async () => {
    const s = sup({ _timer: setInterval(() => {}, 1_000) });
    s.tick = async () => { s.ticks += 1; };
    s.wake();
    s.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(s.ticks).toBe(0);
  });
});
