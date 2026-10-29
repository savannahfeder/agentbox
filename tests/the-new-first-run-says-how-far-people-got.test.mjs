// THE NEW FIRST RUN SAYS HOW FAR PEOPLE GOT.
//
// The first run that starts on real work (components/FirstRun.tsx, 2026-10-26)
// replaced the old walk for every new install, but `first_run_step` and
// `first_run_finished` were only ever sent from the old walk's state. Read in
// the code on 2026-10-29: with the old walk unreachable, no new install has
// sent either since, so nobody can see where the new one loses people, and no
// two versions of it can be compared.
//
// The cases:
//   · each screen has its own number, and nothing else has one;
//   · reaching a screen sends that number once per screen it lands on;
//   · ending the first run is counted with how many chats it brought in
//     (the first-task screen it once ended on is gone, w-31c71743b5).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { stepNumber } from '../renderer/src/first-run';
import { sanitize } from '../shared/analytics-events.mjs';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('each screen has a number', () => {
  it('counts welcome and chats in the order they are met', () => {
    expect(stepNumber('welcome')).toBe(1);
    expect(stepNumber('chats')).toBe(2);
  });

  it('gives nothing else a number, the gone task screen included', () => {
    expect(stepNumber('task')).toBeNull();
    expect(stepNumber('inbox')).toBeNull();
    expect(stepNumber('')).toBeNull();
  });

  it('is a count the sender keeps', () => {
    expect(sanitize('first_run_step', { count: stepNumber('chats') })).toEqual({ count: 2 });
  });
});

describe('the first run reports the screen it is on', () => {
  it('sends first_run_step from an effect on the screen', () => {
    const src = read('renderer/src/components/FirstRun.tsx');
    expect(src).toMatch(/track\?\.\('first_run_step', stepNumber\(screen\) \?\? undefined\)/);
    expect(src).toMatch(/\}, \[screen\]\);/);
  });
});

describe('ending the first run is counted', () => {
  it('with how many chats it brought in, where it hands over to the inbox', () => {
    const app = read('renderer/src/App.tsx');
    const at = app.indexOf('const finishFresh = useCallback(');
    expect(at).toBeGreaterThan(-1);
    const body = app.slice(at, app.indexOf('}, [setTour]);', at));
    expect(body).toMatch(/track\?\.\('first_run_finished', brought\)/);
    expect(body).toContain('setTour(startTour())');
  });

  it('is given that number by the chat screen, and 0 when it is skipped', () => {
    const first = read('renderer/src/components/FirstRun.tsx');
    expect(first).toContain('leave(picked.length)');
    expect(first).toContain("if (k === 'skip') leave(0);");
  });
});
