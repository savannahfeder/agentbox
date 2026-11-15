// A PUSH THAT ONLY DELETES TESTS DOES NOT RUN EVERY TEST.
//
// What broke: the onboarding branch deleted one old test file, and the push
// hook runs the whole suite (about 3,000 files) for any push that deletes a
// code file, in case something imported it. Nothing imports a test file. With
// a dozen agents on the Mac the whole suite did not finish inside the ship's
// hour, so a branch with no red test was stopped and waited for a quieter Mac.
// Measured here by running the real pre-push hook in a throwaway repo with a
// stand-in vitest that writes down what it was asked to run.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WHOLE_SUITE_SHIP_MS } from '../main/ship-queue.mts';
import { runsEveryTest } from '../scripts/lib/ship-rules.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
for (const k of Object.keys(gitEnv)) if (k.startsWith('GIT_') && !/^GIT_(CONFIG_GLOBAL|CONFIG_NOSYSTEM|AUTHOR_|COMMITTER_)/.test(k)) delete gitEnv[k as keyof typeof gitEnv];

let repo: string;
let base: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: gitEnv }).trim();
const write = (file: string, text: string) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), text); };
const remove = (file: string) => fs.rmSync(path.join(repo, file));
const commit = () => { git('add', '-A'); git('commit', '-qm', 'change'); return git('rev-parse', 'HEAD'); };

/** Runs the real hook for a push of HEAD over `base`; returns what it said and what vitest was asked. */
function push() {
  const sha = git('rev-parse', 'HEAD');
  const asked = path.join(repo, 'asked.txt');
  fs.rmSync(asked, { force: true });
  const said = execFileSync('sh', [path.join(repo, 'scripts/hooks/pre-push'), 'origin', 'nowhere'], {
    cwd: repo, encoding: 'utf8', env: gitEnv, input: `refs/heads/main ${sha} refs/heads/main ${base}\n`,
  });
  return { said, asked: fs.existsSync(asked) ? fs.readFileSync(asked, 'utf8').trim() : '' };
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'only-deletes-tests-'));
  git('init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'scripts/hooks'), path.join(repo, 'scripts/hooks'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'scripts/lib'), path.join(repo, 'scripts/lib'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts/red-test-files.mjs'), path.join(repo, 'scripts/red-test-files.mjs'));
  write('node_modules/.bin/vitest', `#!/bin/sh\necho "$@" > "${path.join(repo, 'asked.txt')}"\n`);
  fs.chmodSync(path.join(repo, 'node_modules/.bin/vitest'), 0o755);
  write('.gitignore', 'node_modules/\nasked.txt\n');
  write('main/thing.mts', 'export const thing = 1;\n');
  write('tests/fixtures/helper.mts', 'export const helper = 1;\n');
  write('tests/an-old-check.test.mts', 'import { it } from "vitest";\nit("is old", () => {});\n');
  write('tests/a-list-of-checks.test.mts', 'const named = "an-old-check.test.mts";\n');
  write('tests/an-unrelated-check.test.mts', 'const x = 1;\n');
  base = commit();
});
afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

describe('the pre-push hook', () => {
  it('does not run the whole suite for a push that only deletes a test file', () => {
    remove('tests/an-old-check.test.mts');
    commit();
    const { said, asked } = push();
    expect(said).not.toMatch(/running the whole suite/);
    expect(asked).not.toMatch(/^run /);
  });

  it('still runs the tests that name the deleted test file', () => {
    remove('tests/an-old-check.test.mts');
    commit();
    const { asked } = push();
    expect(asked).toContain('tests/a-list-of-checks.test.mts');
    expect(asked).not.toContain('tests/an-unrelated-check.test.mts');
  });

  it('runs the whole suite when the push deletes a test and a code file', () => {
    remove('tests/an-old-check.test.mts');
    remove('main/thing.mts');
    commit();
    expect(push().said).toMatch(/running the whole suite, because it deletes code/);
  });

  it('runs the whole suite when the push deletes a helper the tests import', () => {
    remove('tests/fixtures/helper.mts');
    commit();
    expect(push().said).toMatch(/running the whole suite, because it deletes code/);
  });
});

describe('the ship script\'s own reading of the same rule', () => {
  it('agrees for a test file, a test and a code file, and a test helper', () => {
    remove('tests/an-old-check.test.mts');
    commit();
    expect(runsEveryTest(git('diff', '--name-status', base, 'HEAD'))).toBe(false);
    remove('main/thing.mts');
    commit();
    expect(runsEveryTest(git('diff', '--name-status', base, 'HEAD'))).toBe(true);
    git('reset', '-q', '--hard', base);
    remove('tests/fixtures/helper.mts');
    commit();
    expect(runsEveryTest(git('diff', '--name-status', base, 'HEAD'))).toBe(true);
  });
});

describe('a ship that does run every test', () => {
  it('gets two hours, because a busy Mac took longer than one', () => {
    expect(WHOLE_SUITE_SHIP_MS).toBe(2 * 60 * 60 * 1000);
  });
});
