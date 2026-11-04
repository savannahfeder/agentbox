// A TEST THAT WALKS A FOLDER RUNS WHEN A FILE APPEARS IN IT.
//
// w-dd3bf12cdf, 2026-10-26. main went red on GitHub at c1d15f0 on
// tests/a-mark-the-app-draws-has-a-font-on-every-machine, on both macOS and
// Linux. That test walks renderer/src for every .css file rather than naming
// one, so it names no file and scripts/lib/tests-that-read.mjs never picked
// it: the commit added renderer/src/components/first-run.css, whose name
// appears in no test at all. Measured before the fix, testsThatRead for that
// file returned only tests/the-app-is-named-in-one-place, so
// `npm run test:changed`, the ship script and the push hook all ran green and
// GitHub went red five minutes after the agent had ended.
//
// This is the same hole as the `git ls-files` one next door
// (a-test-that-reads-every-file-runs-on-every-change): a test can read a file
// it never names, and the quoted-name rule cannot see either. So a path.join
// of quoted segments that IS a folder here, in a test that walks a folder,
// counts as reading everything under it.
//
// Seven other sweeps over renderer/src were blind the same way, among them
// no-screen-draws-a-key-this-keyboard-does-not-have, which is this same bug
// class for key glyphs. All were green when measured, so this found no second
// red; it stops the next one. Measured cost: a renderer or briefs change
// gains 7 or 8 test files, and of 911 tracked source files exactly one
// (renderer/src/threads/Pages.tsx) crosses the gate's 60-file cap, 59 to 65,
// which hands the remainder to GitHub rather than failing.
//
// Only folders are kept because that is what the rule means. Of 260 joined
// paths in folder-walking tests, 11 are folders here, 31 are files and 218
// are not paths in this repo at all.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testsThatRead } from '../scripts/lib/tests-that-read.mjs';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Split so this file does not itself match the rule it checks and so run on
// every change under renderer/src.
const WALKS = 'readdir' + 'Sync';

function repo(files, dirs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'walks-'));
  for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true });
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), text);
  }
  return root;
}

describe('a test that walks a folder in the repo', () => {
  const root = repo({
    'tests/sheets.test.mjs': `const css = (dir) => fs.${WALKS}(dir).filter(f => f.endsWith('.css'));\n`
      + "css(path.join(root, 'renderer', 'src'));",
    // Walks a folder, but joins a FILE's path, not a folder's.
    'tests/one-file.test.mjs': `fs.${WALKS}(tmp); read(path.join(root, 'briefs', 'worker.md'));`,
    // Joins a folder, but walks nothing: it reads the one file it names.
    'tests/no-walk.test.mjs': "readFileSync(path.join(root, 'renderer', 'src', 'styles.css'), 'utf8');",
    'tests/unrelated.test.mjs': "read('main', 'supervisor.mts')",
  }, ['renderer/src/components', 'renderer/src-old', 'briefs', 'main']);

  it('runs for a file that appears in that folder and is named nowhere', () => {
    expect(testsThatRead(['renderer/src/components/first-run.css'], root))
      .toEqual(['tests/sheets.test.mjs']);
  });

  it('runs for a file sitting directly in it', () => {
    expect(testsThatRead(['renderer/src/styles.css'], root))
      .toContain('tests/sheets.test.mjs');
  });

  it('does not run for a change outside that folder', () => {
    expect(testsThatRead(['main/supervisor.mts'], root))
      .not.toContain('tests/sheets.test.mjs');
  });

  it('does not take a folder whose name merely starts the same', () => {
    expect(testsThatRead(['renderer/src-old/legacy.css'], root))
      .not.toContain('tests/sheets.test.mjs');
  });

  it('does not drag in a walker that joined a file rather than a folder', () => {
    expect(testsThatRead(['briefs/anything.md'], root))
      .not.toContain('tests/one-file.test.mjs');
  });

  it('does not count joining a folder without walking it', () => {
    expect(testsThatRead(['renderer/src/components/first-run.css'], root))
      .not.toContain('tests/no-walk.test.mjs');
  });

  it('still picks a test that names the file, alongside', () => {
    expect(testsThatRead(['main/supervisor.mts'], root).sort())
      .toEqual(['tests/unrelated.test.mjs']);
  });

  it('is nothing when only tests changed', () => {
    expect(testsThatRead(['tests/sheets.test.mjs'], root)).toEqual([]);
  });
});

describe('in this repository', () => {
  it('picks the font test for the css file that turned main red', () => {
    expect(testsThatRead(['renderer/src/components/first-run.css'], here))
      .toContain('tests/a-mark-the-app-draws-has-a-font-on-every-machine.test.mjs');
  });

  it('picks it for a css file that does not exist yet', () => {
    expect(testsThatRead(['renderer/src/components/not-written-yet.css'], here))
      .toContain('tests/a-mark-the-app-draws-has-a-font-on-every-machine.test.mjs');
  });

  it('stays cheap: a renderer change gains only a handful of test files', () => {
    const picked = testsThatRead(['renderer/src/components/first-run.css'], here);
    expect(picked.length).toBeLessThan(12);
  });
});
