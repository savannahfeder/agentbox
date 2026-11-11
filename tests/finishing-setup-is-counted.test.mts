// FINISHING SETUP IS COUNTED, AND ONLY FINISHING IT.
//
// `first_run_finished` has been on the approved list and the privacy page since
// 2026-08-19, and nothing ever sent it. Measured 2026-10-06 in PostHog: zero
// events of that name from 33 installs, while `app_opened` had 285. On the day
// downloads opened, about ten new people installed the app and there was no way
// to say how many of them got through setup.
//
// The cases:
//   · walking it to the end counts (the finish card and the import card);
//   · the quiet way out does NOT count, because skipping is not finishing;
//   · the tutorial somebody re-runs from ⌘K weeks later does NOT count, because
//     it is not their first run and it would count the same person twice;
//   · the app really sends it from the walk's one finishing function, by name.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finishedTheFirstRun, tutorialRun } from '../renderer/src/onboarding.ts';
import { EVENT_NAMES } from '../shared/analytics-events.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '../renderer/src/App.tsx'), 'utf8');

describe('finishing setup is counted', () => {
  it('counts a first run walked to the end', () => {
    expect(finishedTheFirstRun({ step: 'done' }, { practised: true })).toBe(true);
  });

  it('does not count the way out', () => {
    expect(finishedTheFirstRun({ step: 'tour' }, { practised: false })).toBe(false);
  });

  it('does not count the tutorial re-run from ⌘K', () => {
    expect(finishedTheFirstRun(tutorialRun('acme'), { practised: true })).toBe(false);
  });

  it('does not count when there is no walk at all', () => {
    expect(finishedTheFirstRun(null, { practised: true })).toBe(false);
  });

  it('is one of the approved events', () => {
    expect(EVENT_NAMES).toContain('first_run_finished');
  });

  it('is sent from the function that ends the walk', () => {
    const start = app.indexOf('const finishRun = useCallback(');
    expect(start).toBeGreaterThan(-1);
    const body = app.slice(start, app.indexOf('}, [closeWhatFloats]);', start));
    expect(body).toMatch(/finishedTheFirstRun\(runRef\.current, \{ practised \}\)/);
    expect(body).toMatch(/track\?\.\('first_run_finished'\)/);
  });
});
