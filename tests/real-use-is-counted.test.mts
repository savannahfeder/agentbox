// REAL USE IS COUNTED, NOT ONLY THE WALKTHROUGH.
//
// On 2026-10-06, the day downloads opened, PostHog said 9 new outside installs
// and 6 of them "finished a task". Read against the code, every one of those
// was the setup walkthrough: `task_finished` fires when a person closes a row,
// the walk has them close two practice rows, and nothing ever runs in the
// practice project. There was no count at all for an agent doing work in a
// real project, none for which setup step people stopped at, and nothing that
// says an install was used on a given day, which is what retention is read
// from (an app left open for a week sends `app_opened` once).
//
// The cases:
//   · an agent's run is counted when it starts and when it ends, with how long
//     and whether it failed, and with which engine from a closed list only;
//   · a task written in the practice project says so, and one in a real
//     project says it is not, so the two can be told apart;
//   · "used today" is sent once per calendar day, again the next day, and
//     never twice on the same day however often the window is focused;
//   · each setup step is counted by its number, and the tutorial re-run is not;
//   · the renderer can still send a name and a number and nothing else.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { EVENTS, sanitize } from '../shared/analytics-events.mts';
import { createDailyCount, runEndedProps } from '../main/analytics.mts';
import { setupStepCount, tutorialRun } from '../renderer/src/onboarding.ts';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('the new counts are on the approved list', () => {
  it('accepts each of them by name', () => {
    for (const name of ['day_active', 'first_run_step', 'task_written', 'run_started', 'run_finished']) {
      expect(EVENTS[name]).toBeTruthy();
      expect(sanitize(name)).toEqual({});
    }
  });

  it('keeps the engine only when it is one of the two', () => {
    expect(sanitize('run_started', { engine: 'codex' })).toEqual({ engine: 'codex' });
    expect(sanitize('run_started', { engine: 'claude' })).toEqual({ engine: 'claude' });
    expect(sanitize('run_started', { engine: '/Users/someone/bin/claude' })).toEqual({});
  });

  it('keeps failed and practice only as true or false', () => {
    expect(sanitize('run_finished', { failed: true, seconds: 41 })).toEqual({ failed: true, seconds: 41 });
    expect(sanitize('task_written', { practice: false })).toEqual({ practice: false });
    expect(sanitize('task_written', { practice: 'Practice' })).toEqual({});
  });
});

describe('an agent run', () => {
  it('ends with how long it took, whether it failed, and the engine', () => {
    const session = { startedAt: 1_000, exitFailed: false, engine: 'claude' };
    expect(runEndedProps(session, 62_400)).toEqual({ seconds: 61, failed: false, engine: 'claude' });
  });

  it('counts a failed run as failed', () => {
    const session = { startedAt: 0, exitFailed: true, engine: 'codex' };
    expect(runEndedProps(session, 5_000)).toEqual({ seconds: 5, failed: true, engine: 'codex' });
  });

  it('is counted where a session starts and where it exits', () => {
    const sup = read('main/supervisor.mts');
    const born = sup.indexOf('const session = {\n      child, itemId: item.id');
    expect(born).toBeGreaterThan(-1);
    expect(sup.slice(born, born + 2500)).toMatch(/this\.count\?\.\('run_started', \{ engine \}\)/);
    // The exit handler's work is `settleExit` (a stop signal's death waits a
    // moment to be judged: tests/a-worker-stopped-with-the-app-is-not-a-failed-run).
    const exit = sup.indexOf('const settleExit = (code');
    expect(sup.slice(exit, exit + 800)).toMatch(/this\.count\?\.\('run_finished', runEndedProps\(session, Date\.now\(\)\)\)/);
    expect(read('main/main.mts')).toMatch(/supervisor\.count = \(name, props\) => analytics\.track\(name, props\)/);
  });
});

describe('a task written', () => {
  it('says whether it was in the practice project', () => {
    const ipc = read('main/ipc.mts');
    const at = ipc.indexOf("ipcMain.handle('zero:compose',");
    const body = ipc.slice(at, ipc.indexOf('return out;', at));
    expect(body).toMatch(/analytics\.track\('task_written', \{ practice: isPractice\(product\) \}\)/);
    expect(ipc).toMatch(/analytics\.track\('reply_sent', \{ practice: isPractice\(product\) \}\)/);
    expect(ipc).toMatch(/analytics\.track\('task_finished', \{ practice: isPractice\(product\) \}\)/);
  });
});

describe('used today', () => {
  const day = (iso) => new Date(iso).getTime();

  it('is sent once on the first touch of a day', () => {
    const sent = [];
    const touch = createDailyCount((n) => sent.push(n));
    touch(day('2026-10-06T09:00:00'));
    touch(day('2026-10-06T09:05:00'));
    touch(day('2026-10-06T23:59:00'));
    expect(sent).toEqual(['day_active']);
  });

  it('is sent again the next day', () => {
    const sent = [];
    const touch = createDailyCount((n) => sent.push(n));
    touch(day('2026-10-06T23:59:00'));
    touch(day('2026-10-07T00:01:00'));
    expect(sent).toEqual(['day_active', 'day_active']);
  });

  it('is wired to launch and to the window coming forward', () => {
    const main = read('main/main.mts');
    expect(main).toMatch(/const usedToday = createDailyCount\(\(name\) => analytics\.track\(name\)\)/);
    expect(main).toMatch(/window\.on\('focus', \(\) => usedToday\(Date\.now\(\)\)\)/);
  });
});

describe('setup steps', () => {
  it('counts each step of the first run by its number', () => {
    expect(setupStepCount({ step: 'welcome' })).toBe(1);
    expect(setupStepCount({ step: 'tour' })).toBe(5);
    expect(setupStepCount({ step: 'clear' })).toBe(11);
  });

  it('does not count the tutorial re-run, the end, or no walk', () => {
    expect(setupStepCount(tutorialRun('acme'))).toBeNull();
    expect(setupStepCount({ step: 'landed' })).toBeNull();
    expect(setupStepCount(null)).toBeNull();
  });

  it('is sent from the app with the number and nothing else', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/window\.zero\?\.track\?\.\('first_run_step', step\)/);
    expect(read('preload.cjs')).toMatch(/track: \(name, count\) => ipcRenderer\.invoke\('zero:track', \{ name, count \}\)/);
    expect(read('main/ipc.mts')).toMatch(/analytics\.track\(name, Number\.isFinite\(count\) \? \{ count \} : undefined\)/);
  });
});
