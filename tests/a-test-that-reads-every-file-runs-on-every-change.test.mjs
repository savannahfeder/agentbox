// A TEST THAT READS EVERY FILE RUNS ON EVERY CHANGE.
//
// w-a358961e3e, 2026-10-15. tests/the-app-is-named-in-one-place.test.mjs reads
// every tracked file through `git ls-files`, so it names no file and
// scripts/lib/tests-that-read.mjs never picked it. `npm run test:changed`, the
// ship script and the push hook skipped it, and main went red on GitHub after
// 5677cee and 04ee8bd (10-04), 1c0ea84 (10-04), 7d44da9 (10-05) and e492610
// (10-12). Measured before the fix: testsThatRead for Settings.tsx,
// plan-setup.ts, main/feedback.mjs and main/memory-gate.mjs, the files those
// commits touched, did not include it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testsThatRead } from '../scripts/lib/tests-that-read.mjs';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reads-all-'));
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), text);
  }
  return root;
}

describe('a test that lists every tracked file', () => {
  const root = repo({
    // Split so this file does not itself match and run on every change.
    'tests/every-file.test.mjs': "const tracked = execFileSync('git', ['ls-" + "files'], { cwd: repo });",
    'tests/one-path.test.mjs': "execFileSync('git', ['ls-files', '-s', 'scripts/hooks/pre-push'])",
    'tests/fixture.test.mjs': "expect(git(dir, 'ls-files')).toBe('.gitignore');",
    'tests/unrelated.test.mjs': "read('renderer', 'src', 'components', 'Focus.tsx')",
  });

  it('runs for any source change', () => {
    expect(testsThatRead(['renderer/src/components/Settings.tsx'], root)).toEqual(['tests/every-file.test.mjs']);
    expect(testsThatRead(['main/feedback.mjs'], root)).toEqual(['tests/every-file.test.mjs']);
  });

  it('does not count a test that lists one path, or lists a throwaway folder', () => {
    const picked = testsThatRead(['renderer/src/components/Thread.tsx'], root);
    expect(picked).not.toContain('tests/one-path.test.mjs');
    expect(picked).not.toContain('tests/fixture.test.mjs');
  });

  it('still picks a test that names the file, alongside', () => {
    expect(testsThatRead(['renderer/src/components/Focus.tsx'], root).sort())
      .toEqual(['tests/every-file.test.mjs', 'tests/unrelated.test.mjs']);
  });

  it('is nothing when only tests changed', () => {
    expect(testsThatRead(['tests/unrelated.test.mjs'], root)).toEqual([]);
  });
});

describe('in this repository', () => {
  it('picks the naming test for the files that turned main red', () => {
    for (const f of ['renderer/src/components/Settings.tsx', 'main/feedback.mjs', 'main/memory-gate.mjs']) {
      expect(testsThatRead([f], here), f).toContain('tests/the-app-is-named-in-one-place.test.mjs');
    }
  });
});
