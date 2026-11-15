// A PUSH THAT RUNS EVERY TEST GETS AN HOUR TO SHIP, NOT TWENTY MINUTES.
//
// What broke: the Glass removal deletes three code files, and the push hook
// runs the whole suite (about 3,000 files) for any push that deletes code or
// changes what every test depends on. The ship stops its script after 20
// minutes, and on a busy Mac the whole suite takes longer, so the same branch
// bounced twice with "ship: stopped after 20 minutes" and no failing test. On
// GitHub the whole suite took 13 to 30 minutes a run that week; in batches on
// a 2-core cloud machine it took about half an hour. Measured here by running
// the real scripts/ship.mjs on branches that do each thing, against a
// throwaway origin, and by timing out a script that says the same line.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RUNS_EVERY_TEST, runScript } from '../main/ship-queue.mts';
import { DELETED_CODE, EVERY_TEST_DEPENDS_ON, runsEveryTest } from '../scripts/lib/ship-rules.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const SHIP_SCRIPT = path.join(ROOT, 'scripts', 'ship.mjs');

let tmp: string;
let base: string;
let task: string;
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv });
const write = (file: string, text: string) => { fs.mkdirSync(path.dirname(path.join(task, file)), { recursive: true }); fs.writeFileSync(path.join(task, file), text); };
const commit = () => { git(task, 'add', '-A'); git(task, 'commit', '-qm', 'change'); };
const carries = () => git(task, 'diff', '--name-status', 'origin/main', 'HEAD');

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'every-test-ship-'));
  base = path.join(tmp, 'base');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  git(tmp, 'init', '-q', '-b', 'main', 'base');
  fs.mkdirSync(path.join(base, 'main', 'native'), { recursive: true });
  fs.writeFileSync(path.join(base, 'main', 'glass.mts'), 'export const glass = "a line long enough for git to see a move as a move";\n');
  fs.writeFileSync(path.join(base, 'main', 'native', 'glass.mm'), '// native\n');
  fs.writeFileSync(path.join(base, 'main', 'other.mts'), 'export const other = 1;\n');
  fs.writeFileSync(path.join(base, 'package.json'), '{"name":"x"}\n');
  git(base, 'add', '-A');
  git(base, 'commit', '-qm', 'base');
  git(base, 'remote', 'add', 'origin', path.join(tmp, 'origin.git'));
  git(base, 'push', '-q', 'origin', 'main');
  git(base, 'fetch', '-q', 'origin');
  task = path.join(tmp, 'w-x');
  git(base, 'worktree', 'add', '-q', '-b', 'agentbox/w-x', task, 'main');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('which pushes the hook runs every test for', () => {
  it('a branch that deletes a code file', () => {
    fs.rmSync(path.join(task, 'main/glass.mts'));
    commit();
    expect(runsEveryTest(carries())).toBe(true);
  });

  it('a branch that changes what every test depends on', () => {
    write('package.json', '{"name":"x","dependencies":{"y":"1"}}\n');
    commit();
    expect(runsEveryTest(carries())).toBe(true);
  });

  it('not a branch that moves a code file', () => {
    git(task, 'mv', 'main/glass.mts', 'main/pane.mts');
    commit();
    expect(runsEveryTest(carries())).toBe(false);
  });

  it('not a branch that deletes only a native file', () => {
    fs.rmSync(path.join(task, 'main/native/glass.mm'));
    commit();
    expect(runsEveryTest(carries())).toBe(false);
  });

  it('not a branch that only edits code', () => {
    write('main/other.mts', 'export const other = 2;\n');
    commit();
    expect(runsEveryTest(carries())).toBe(false);
  });
});

describe('the rule is the hook\'s own', () => {
  const hook = fs.readFileSync(path.join(ROOT, 'scripts', 'hooks', 'pre-push'), 'utf8');

  it('counts the same files as code when they are deleted', () => {
    expect(hook).toContain(`--diff-filter=D "$base" "$local_sha" | grep -E '${DELETED_CODE}'`);
  });

  it('names the same files every test depends on', () => {
    expect(hook).toContain(`grep -qE '${EVERY_TEST_DEPENDS_ON}'`);
  });
});

describe('the ship script', () => {
  it('says so before a push that runs every test, and still ships it', async () => {
    fs.rmSync(path.join(task, 'main/glass.mts'));
    commit();
    const { code, out } = await runScript(SHIP_SCRIPT, task, { env: gitEnv });
    expect(out).toContain(RUNS_EVERY_TEST);
    expect(out).toContain('ship: shipped');
    expect(code).toBe(0);
  }, 60_000);

  it('says nothing of the kind before any other push', async () => {
    write('main/other.mts', 'export const other = 2;\n');
    commit();
    const { code, out } = await runScript(SHIP_SCRIPT, task, { env: gitEnv });
    expect(out).not.toContain(RUNS_EVERY_TEST);
    expect(code).toBe(0);
  }, 60_000);
});

describe('the ship queue\'s deadline', () => {
  const script = (says: string) => {
    const file = path.join(tmp, 'hangs.mjs');
    fs.writeFileSync(file, `console.log(${JSON.stringify(says)});\nsetTimeout(() => console.log('done'), 1500);\n`);
    return file;
  };

  it('waits the longer deadline once the script says every test runs', async () => {
    const { code, out } = await runScript(script(`${RUNS_EVERY_TEST}, because it deletes code.`), tmp, { timeout: 500, wholeSuiteTimeout: 10_000 });
    expect(out).toContain('done');
    expect(code).toBe(0);
  });

  it('stops at the usual deadline otherwise, and says how long it gave', async () => {
    const { code, out } = await runScript(script('ship: pushing to origin main (attempt 1 of 3).'), tmp, { timeout: 500, wholeSuiteTimeout: 10_000 });
    expect(out).not.toContain('done');
    expect(out).toMatch(/ship: stopped after 1 minute\.$/);
    expect(code).not.toBe(0);
  });

  it('still stops at the longer deadline', async () => {
    const { out } = await runScript(script(RUNS_EVERY_TEST), tmp, { timeout: 200, wholeSuiteTimeout: 600 });
    expect(out).not.toContain('done');
    expect(out).toMatch(/stopped after/);
  });
});
