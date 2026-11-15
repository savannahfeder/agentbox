// WHAT GOES WRONG IN A POWER TEST FOLLOWS ITS CLOCK.
//
// What was missing (w-811757c0b5, 2026-10-20): the bugs the person running
// these tests finds by hand come from a long day, not from a clean run: a
// login runs out partway, Codex runs out, the app restarts for an update, the
// laptop sleeps, an agent hangs. A tester typing ordinary tasks never met any
// of them, because the stand-ins only misbehaved when a task said so.
//
// chaosPlan lays those out as fractions of the test's length, so a 30-minute
// test and an 8-hour one have the same shape of day, and worldAt turns the
// windows open at a moment into the world.json the stand-ins read.
import { describe, it, expect } from 'vitest';
import { chaosPlan, worldAt } from '../.claude/skills/power-test/scripts/plan.mjs';

const HOUR = 3_600_000;

describe('the day a power test lays out', () => {
  it('is empty with chaos none', () => {
    expect(chaosPlan('none', HOUR)).toEqual([]);
  });

  it('refuses a level it does not know', () => {
    expect(() => chaosPlan('extreme', HOUR)).toThrow(/none, light, normal, heavy/);
  });

  it('runs a second login out, then Codex, then every login, then restarts and freezes the app, in that order, inside the test', () => {
    const plan = chaosPlan('normal', HOUR, { logins: 2, codex: true });
    expect(plan.map((e) => e.kind)).toEqual(['agents', 'login-out', 'codex-out', 'restart', 'all-out', 'sleep']);
    for (const e of plan) {
      expect(e.at).toBeGreaterThanOrEqual(0);
      expect(e.until ?? e.at).toBeLessThanOrEqual(HOUR);
      expect(e.says).toBeTruthy();
    }
  });

  it('runs no second login out for someone with one, and no Codex out for someone without it', () => {
    const kinds = chaosPlan('normal', HOUR, { logins: 1, codex: false }).map((e) => e.kind);
    expect(kinds).not.toContain('login-out');
    expect(kinds).not.toContain('codex-out');
    expect(kinds).toContain('all-out');
  });

  it('on real tools does only what happens to the app itself', () => {
    const kinds = chaosPlan('heavy', HOUR, { real: true }).map((e) => e.kind);
    expect(kinds).toEqual(['restart', 'sleep', 'crash']);
  });

  it('freezes the app for at least 30 seconds and at most 3 minutes', () => {
    expect(chaosPlan('normal', 10 * 60_000).find((e) => e.kind === 'sleep').ms).toBe(30_000);
    expect(chaosPlan('normal', 8 * HOUR).find((e) => e.kind === 'sleep').ms).toBe(180_000);
  });
});

describe('the stand-ins\' world at one moment', () => {
  const plan = chaosPlan('normal', HOUR, { logins: 2, codex: true });

  it('is only the agents\' pace at the start', () => {
    const w = worldAt(plan, 0);
    expect(w.out).toBeUndefined();
    expect(w.pace).toEqual({ minMs: 5_000, maxMs: 90_000 });
  });

  it('has the second login out from a fifth of the way to two fifths, and not after', () => {
    expect(worldAt(plan, 0.2 * HOUR).out).toEqual(['.claude-second']);
    expect(worldAt(plan, 0.3 * HOUR).out).toEqual(['.claude-second']);
    expect(worldAt(plan, 0.4 * HOUR).out).toBeUndefined();
  });

  it('has every login out together near two thirds of the way', () => {
    expect(worldAt(plan, 0.65 * HOUR).out).toEqual(['default', '.claude-second']);
  });
});
