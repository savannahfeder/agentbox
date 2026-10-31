// THE NEW FIRST RUN COUNTS EACH STEP AND THE FINISH.
//
// The first run that starts on real work (components/FirstRun.tsx, 2026-10-26)
// replaced the walk that sent `first_run_step` and `first_run_finished`, and it
// sent neither. Measured in PostHog 2026-10-29: 0.1.17 sent 47 step counts from
// 4 installs; 0.1.18 and 0.1.19 sent none, from 9 installs that opened the app,
// so nobody could see where in setup a new person stopped.
//
// A second gap sat under it: a browser tab's bridge wrapped `track(name,
// count)` as `{ name }`, so any number sent with a count from a tab arrived
// blank.
//
// The cases:
//   · each screen has its own number, and none of them is a number the old
//     walk used, so the two can never be read as one;
//   · the screen sends its number as it is shown, and a sent first task is the
//     finish, while leaving without one is not;
//   · the number survives the trip, on the desktop and from a tab.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_RUN_STEP } from '../renderer/src/first-run.ts';
import { BEAT } from '../renderer/src/onboarding.ts';
import { WRAPPED_ARGS } from '../shared/bridge-map.mjs';
import { sanitize } from '../shared/analytics-events.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repoRoot, f), 'utf8');

describe('the new first run counts each step', () => {
  it('numbers every screen, each once', () => {
    expect(Object.keys(FIRST_RUN_STEP).sort()).toEqual(['chats', 'task', 'welcome', 'where']);
    expect(new Set(Object.values(FIRST_RUN_STEP)).size).toBe(4);
  });

  it('uses no number the old walk used', () => {
    const old = new Set(Object.values(BEAT));
    for (const n of Object.values(FIRST_RUN_STEP)) expect(old.has(n), String(n)).toBe(false);
  });

  it('keeps the number through the approved list', () => {
    expect(sanitize('first_run_step', { count: FIRST_RUN_STEP.where })).toEqual({ count: FIRST_RUN_STEP.where });
  });

  it('sends the number of the screen being shown', () => {
    const screen = read('renderer/src/components/FirstRun.tsx');
    expect(screen).toMatch(/track\?\.\('first_run_step', FIRST_RUN_STEP\[screen\]\)/);
  });

  it('counts the finish only when a first task was sent', () => {
    const screen = read('renderer/src/components/FirstRun.tsx');
    expect(screen).toMatch(/if \(sent\) [^\n]*track\?\.\('first_run_finished'\)/);
  });
});

describe('a number sent with a count reaches the app from a tab', () => {
  const preload = read('preload.cjs');

  it('wraps every argument preload hands over, in the same order', () => {
    for (const [name, keys] of Object.entries(WRAPPED_ARGS)) {
      const at = preload.indexOf(`  ${name}: (`);
      const params = preload.slice(at).match(/\(([^)]*)\)/)[1].split(',').map((s) => s.trim()).filter(Boolean);
      expect(keys, name).toEqual(params);
    }
  });

  it('carries the setup step number in particular', () => {
    expect(WRAPPED_ARGS.track).toEqual(['name', 'count']);
  });
});
