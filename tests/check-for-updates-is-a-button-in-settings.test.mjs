// CHECK FOR UPDATES IS A BUTTON IN SETTINGS (w-39d6c237f7, 2026-10-07).
//
// The ask: "a way to pull a new version on demand, as many apps do, instead of
// waiting for the automatic check."
//
// Measured before this change, on 2026-10-07: a manual check already existed
// the whole way down the stack and nothing on screen reached it.
// `zero:update-check` calls `updater.check({ manual: true })` (main/ipc.mjs:1824)
// and `api.updateCheck()` is in renderer/src/api.ts, but `grep -rn updateCheck
// renderer/src` found one caller, api.ts itself. So the installed app checked
// every 6 hours (main/updater.mjs EVERY_MS), a copy run from a checkout every
// 30 minutes (main/source-updater.mjs), and a person who wanted to know now
// had no way to ask.
//
// WHAT THIS FILE HOLDS, and the trap behind each:
//
//   THE WORDS ARE ONE PURE FUNCTION, `updateLook`, because three surfaces say
//   them: the Settings row, its button, and the ⌘K toast. Two copies of these
//   sentences is how one surface starts claiming "up to date" about a check
//   that failed.
//
//   A FAILED CHECK NEVER READS AS A HEALTHY ONE. This is the whole reason the
//   button exists: main/updater.mjs is silent when it fails on purpose
//   (point 2 at the top of that file), and Settings is the one screen allowed
//   to say so. So the error and unsupported phases say what went wrong, and
//   they must not say the app is up to date.
//
//   IT OFFERS RESTART ONLY WHEN THERE IS SOMETHING TO RESTART ONTO. `restart`
//   is true in `ready` and in no other phase, and never while a rebuild is
//   already running: a second press mid-update is a quit in the middle of
//   npm run build.
//
//   BOTH KINDS OF COPY ARE COVERED. An installed app downloads a version and
//   restarts in seconds; a copy run from a checkout rebuilds and takes about a
//   minute, and says how many changes it is behind.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesQuery } from '../renderer/src/palette-rows';
import { Name } from '../shared/product-name.mjs';
import { CHECK_SAY, SAY, updateLook } from '../renderer/src/update-row.ts';
import { searchSettings } from '../renderer/src/settings-search.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** What main hands the screens (`describe` in main/updater.mjs), by phase. */
const state = (over = {}) => ({
  phase: 'idle',
  currentVersion: '0.1.0',
  newVersion: null,
  percent: null,
  error: null,
  checkedAt: null,
  readyAt: null,
  ready: false,
  source: false,
  changes: [],
  behind: null,
  installing: false,
  ...over,
});

describe('what the row says it found', () => {
  it('says the app is up to date when the check found nothing', () => {
    const look = updateLook(state({ phase: 'current', checkedAt: Date.now() }));
    expect(look.sentence).toBe(`${Name} is up to date.`);
    expect(look.button).toBe(CHECK_SAY.check);
    expect(look.restart).toBe(false);
    expect(look.busy).toBe(false);
  });

  it('says it is looking while the check runs', () => {
    expect(updateLook(state(), { checking: true }).sentence).toBe(CHECK_SAY.looking);
    expect(updateLook(state({ phase: 'checking' })).sentence).toBe(CHECK_SAY.looking);
    expect(updateLook(state({ phase: 'checking' })).busy).toBe(true);
    expect(updateLook(state({ phase: 'checking' })).button).toBe(CHECK_SAY.checking);
  });

  it('counts the download out, and cannot be pressed while it runs', () => {
    const look = updateLook(state({ phase: 'downloading', newVersion: '0.2.0', percent: 41 }));
    expect(look.sentence).toContain('41%');
    expect(look.busy).toBe(true);
    expect(look.restart).toBe(false);
  });

  it('offers the restart once an installed copy has the new version on disk', () => {
    const look = updateLook(state({ phase: 'ready', newVersion: '0.2.0', percent: 100, ready: true }));
    expect(look.sentence).toContain('0.2.0');
    expect(look.button).toBe(SAY.restart);
    expect(look.restart).toBe(true);
    expect(look.busy).toBe(false);
  });

  it('counts the changes for a copy run from a checkout, and says it takes a minute', () => {
    const look = updateLook(state({
      phase: 'ready', ready: true, source: true, currentVersion: '7ccdb86', newVersion: 'f273e1b',
      changes: ['A reply moves the agent row'], behind: 4,
    }));
    expect(look.sentence).toContain('4 new changes');
    expect(look.sentence).toContain('about a minute');
    expect(look.restart).toBe(true);
  });

  it('says one change in the singular', () => {
    const look = updateLook(state({ phase: 'ready', ready: true, source: true, behind: 1, newVersion: 'f273e1b' }));
    expect(look.sentence).toContain('1 new change.');
  });

  it('says the rebuild is running, and offers nothing to press', () => {
    const look = updateLook(state({ phase: 'installing', source: true, installing: true, ready: false }));
    expect(look.sentence).toBe(SAY.installing);
    expect(look.busy).toBe(true);
    expect(look.restart).toBe(false);
    expect(look.button).toBe(CHECK_SAY.updating);
  });
});

// THE CASES THAT MUST NOT READ AS HEALTHY. The automatic check is silent when
// it fails, so these sentences are the only place a person ever learns why.
describe('why it could not check', () => {
  it('says what went wrong instead of claiming the app is current', () => {
    const look = updateLook(state({ phase: 'error', error: 'Could not reach the internet.' }));
    expect(look.sentence).toBe('Could not reach the internet.');
    expect(look.sentence).not.toContain('up to date');
    expect(look.restart).toBe(false);
    expect(look.busy).toBe(false);
    // Still pressable: the plane landed.
    expect(look.button).toBe(CHECK_SAY.check);
  });

  it('passes on the reason this copy does not update itself at all', () => {
    const why = 'This folder has changes of your own in it, so it does not update itself.';
    const look = updateLook(state({ phase: 'unsupported', error: why }));
    expect(look.sentence).toBe(why);
    expect(look.sentence).not.toContain('up to date');
    expect(look.restart).toBe(false);
  });

  it('never claims a version is up to date with no answer behind it', () => {
    expect(updateLook(null).sentence).not.toContain('up to date');
    expect(updateLook(state()).sentence).not.toContain('up to date');
    expect(updateLook(state()).restart).toBe(false);
  });

  it('keeps a failed restart`s own words, and says a second press retries', () => {
    const look = updateLook(state({
      phase: 'ready', ready: true, source: true, behind: 2, newVersion: 'f273e1b',
      error: 'The new code would not build: error TS2322',
    }));
    expect(look.sentence).toContain('would not build');
    expect(look.sentence).toContain('tries again');
    expect(look.restart).toBe(true);
  });
});

describe('the button on the General page', () => {
  const settings = read('renderer/src/components/Settings.tsx');

  it('is a group of its own, which the search can scroll to', () => {
    expect(settings).toContain('<Group id="updates"');
  });

  it('asks main through the one door that already existed', () => {
    expect(settings).toContain('api.updateCheck()');
    expect(settings).toContain('api.updateInstall()');
  });

  it('draws the words from the shared function, never its own', () => {
    expect(settings).toContain('updateLook(');
    expect(settings).toMatch(/import \{[^}]*updateLook[^}]*\} from '\.\.\/update-row'/);
  });

  it('sits above Account, which is still the last thing on the page', () => {
    const general = settings.slice(settings.indexOf("pane === 'general'"), settings.indexOf("pane === 'claude'"));
    expect(general).toContain('<Updates state={update} />');
    expect(general.indexOf('<Updates')).toBeLessThan(general.indexOf('id="account"'));
  });

  it('is handed the state the rest of the app already reads', () => {
    expect(read('renderer/src/App.tsx')).toContain('update={snap?.update ?? null}');
  });
});

describe('finding it', () => {
  const hits = (q) => searchSettings(q, { pages: ['general'] }).map((h) => h.label);

  it('is found by the words a person would type', () => {
    for (const q of ['update', 'check for updates', 'new version', 'upgrade']) {
      expect(hits(q)).toContain(CHECK_SAY.check);
    }
  });

  it('is not found by a word that is only inside another one', () => {
    expect(hits('pdate')).toEqual([]);
  });
});

describe('the same command in ⌘K', () => {
  const palette = read('renderer/src/components/Palette.tsx');

  it('offers the check by name', () => {
    expect(palette).toContain('CHECK_SAY.check');
    expect(palette).toContain("id: 'update-check'");
  });

  it('answers in the same words the Settings row uses', () => {
    expect(read('renderer/src/App.tsx')).toContain('updateLook(');
  });

  it('is found by typing update, and does not sit beside a second update row', () => {
    const row = { id: 'update-check', label: CHECK_SAY.check, keywords: 'update upgrade new version release' };
    expect(matchesQuery('updat', row)).toBe(true);
    expect(matchesQuery('version', row)).toBe(true);
    // The restart row is the only update row while one is waiting: the check
    // stands down rather than offering to look for what is already on disk.
    expect(palette).toContain('...(updateReady ? [{');
    expect(palette).toContain('...(updateReady ? [] : [{');
  });
});
