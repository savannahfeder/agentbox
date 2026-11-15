// A POWER TEST BRINGS BACK A COPY THAT DID NOT RESTART (w-3d0fa23ffb, 2026-10-21).
//
// The test in the founder's room restarted the tester's copy at 16:17, as a
// restart on its clock. At load average 60 the copy did not print its address
// inside 30 seconds, the restart was logged as failed, and nothing tried again:
// the tester spent 20 minutes on "127.0.0.1 refused to connect" and logged it
// as the app's server gone. A restart by hand at 16:37 took 1.8 seconds. The
// runner now tries again every minute until the copy answers or the clock ends.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { restartAgain } from '../.claude/skills/power-test/scripts/plan.mjs';

const MIN = 60_000;

it('a copy that is up is left alone', () => {
  expect(restartAgain({ down: null, now: 10 * MIN, deadline: 60 * MIN })).toBe(false);
});

it('a copy that is down is tried again a minute after the last try, not before', () => {
  const down = { since: 0, tried: 0 };
  expect(restartAgain({ down, now: MIN - 1, deadline: 60 * MIN })).toBe(false);
  expect(restartAgain({ down, now: MIN, deadline: 60 * MIN })).toBe(true);
});

it('nothing is tried once the clock has run out', () => {
  expect(restartAgain({ down: { since: 0, tried: 0 }, now: 61 * MIN, deadline: 60 * MIN })).toBe(false);
});

it('the runner marks a failed restart down and tries again on its tick', () => {
  const runner = fs.readFileSync(new URL('../.claude/skills/power-test/scripts/power-test.mjs', import.meta.url), 'utf8');
  expect(runner).toMatch(/kind: 'restart-failed'[\s\S]{0,400}down = \{ since: /);
  expect(runner).toMatch(/if \(restartAgain\(\{ down, now, deadline/);
});
