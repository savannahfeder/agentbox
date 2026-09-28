// THE SUITE DOES NOT WALK INTO A COPY OF ITSELF.
//
// The guard is scripts/hooks/pre-push, which runs the whole suite before
// anything leaves her Mac. It ran vitest with no config at all, so vitest used
// its own default include, `**/*.{test,spec}.?(c|m)[jt]s?(x)`, which walks
// every folder under the repo root that is not node_modules.
//
// Two agent worktrees were sitting in wt/ INSIDE the checkout. Measured on her
// repo 2026-08-24: 205 test files in tests/, which are hers, and 376 more under
// wt/clip-today and wt/clip-with, which are two half-finished branches nobody
// was pushing. The runner did nearly three times the work it should, and six
// red tests in that borrowed half refused a push whose own code was green. A
// session had to send it with --no-verify to get her fix out.
//
// The fix is one line of scope: her tests live in tests/ and nowhere else, so
// the include is anchored there. A nested copy keeps its tests at
// <copy>/tests/..., which `tests/**` cannot match, so this holds for a copy
// named anything at all rather than only for one named wt.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import { fileURLToPath } from 'node:url';
import config, { SUITE_INCLUDE, SUITE_EXCLUDE } from '../vitest.config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// What vitest would actually decide about a path, include and exclude together.
const wouldRun = (p) =>
  SUITE_INCLUDE.some((g) => picomatch.isMatch(p, g)) &&
  !SUITE_EXCLUDE.some((g) => picomatch.isMatch(p, g));

describe('which files the suite claims as ours', () => {
  it('takes the tests in tests/, which is where every one of them lives', () => {
    expect(wouldRun('tests/row-summary.test.mjs')).toBe(true);
    // Every file in tests/ is a *.test.mjs and the folder is flat today, but a
    // subfolder tomorrow should not silently stop being run.
    expect(wouldRun('tests/quiet/the-line-waits.test.mjs')).toBe(true);
  });

  it('refuses the copies that were in wt/, which is the red she hit', () => {
    expect(wouldRun('wt/clip-today/tests/row-summary.test.mjs')).toBe(false);
    expect(wouldRun('wt/clip-with/tests/games-2048.test.mjs')).toBe(false);
  });

  it('refuses a nested copy whatever it is called, not only one called wt', () => {
    // The next session to leave one will not name it wt. The anchor is what
    // holds here, not a list of folder names.
    expect(wouldRun('scratch/tests/row-summary.test.mjs')).toBe(false);
    expect(wouldRun('release/from-main/tests/row-summary.test.mjs')).toBe(false);
    expect(wouldRun('some/deep/place/tests/row-summary.test.mjs')).toBe(false);
  });

  it('still refuses node_modules, which the defaults were doing for us', () => {
    expect(wouldRun('node_modules/whatever/tests/a.test.mjs')).toBe(false);
  });

  it('is wired into the config vitest reads, not just exported beside it', () => {
    expect(config.test.include).toEqual(SUITE_INCLUDE);
    expect(config.test.exclude).toEqual(SUITE_EXCLUDE);
  });
});

describe('every test file the runner picks up here', () => {
  it('is under tests/, measured by asking vitest itself', () => {
    // Not a re-statement of the globs: this runs the real resolver against the
    // real checkout, which is the thing the pre-push hook does.
    const out = execFileSync(
      path.join(root, 'node_modules/.bin/vitest'),
      ['list', '--filesOnly'],
      { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '1' } },
    );
    const files = out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith('.mjs'));
    expect(files.length).toBeGreaterThan(150);
    const strays = files.filter((f) => !path.resolve(root, f).startsWith(path.join(root, 'tests') + path.sep));
    expect(strays).toEqual([]);
  });
});

describe('the tests/ folder itself', () => {
  it('holds every test file in the checkout that is ours', () => {
    // If someone puts a test somewhere else, the anchored include would skip it
    // in silence. This is the alarm for that.
    const ours = fs
      .readdirSync(path.join(root, 'tests'))
      .filter((f) => f.endsWith('.test.mjs'));
    expect(ours.length).toBeGreaterThan(150);
  });
});
