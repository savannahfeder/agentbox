// A REFUSED SHIP KEEPS THE END OF WHAT IT SAID (w-0240d72133).
//
// Four ships of one branch came back as "the test run died without naming a
// failing test", and one note ended "It last said: at Ri", cut off mid-word.
// scripts/ship.mjs wrote the hook's whole test output, then called
// process.exit(1) at once. Writes to a pipe are not always done when exit
// runs, so the last of the output never reached the ship queue: the failing
// test's name and the script's own "refused" line went with it. Measured by
// running the real script against a throwaway repository whose hook prints
// 3 MB and then a FAIL line: before the fix the note said the run died.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScript, failureNote, whyItDidNotShip } from '../main/ship-queue.mjs';

const SHIP_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ship.mjs');
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env }).trim();

let tmp; let task;

function repoWhoseHookSays(bytes, last) {
  git(tmp, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  const base = path.join(tmp, 'base');
  git(tmp, 'init', '-q', '-b', 'main', 'base');
  git(base, 'config', 'user.email', 'test@example.com');
  git(base, 'config', 'user.name', 'Test');
  git(base, 'remote', 'add', 'origin', path.join(tmp, 'origin.git'));
  fs.writeFileSync(path.join(base, 'readme.txt'), 'hello\n');
  git(base, 'add', '.');
  git(base, 'commit', '-q', '-m', 'init');
  git(base, 'push', '-q', 'origin', 'main');
  task = path.join(tmp, 'w-mine');
  git(base, 'worktree', 'add', '-q', '-b', 'agentbox/w-mine', task, 'main');
  fs.writeFileSync(path.join(task, 'notes.txt'), 'mine\n');
  git(task, 'add', '.');
  git(task, 'commit', '-q', '-m', 'A file of its own');
  // The ship queue pins the hooks to the base checkout's scripts/hooks.
  const hooks = path.join(base, 'scripts', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  const line = ' ✓ tests/a-test-that-passed.test.mjs (3 tests) 12ms\n';
  fs.writeFileSync(path.join(hooks, 'pre-push'), [
    '#!/usr/bin/env node',
    `process.stdout.write(${JSON.stringify(line)}.repeat(${Math.ceil(bytes / line.length)}));`,
    `process.stdout.write(${JSON.stringify(last)});`,
    'process.exitCode = 1;',
  ].join('\n'), { mode: 0o755 });
}

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-tail-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('a ship whose hook refuses after a long test run', () => {
  it('still names the failing test the hook printed last', async () => {
    repoWhoseHookSays(3 * 1024 * 1024, ' FAIL  tests/the-real-reason.test.mjs > it broke\n');
    const { code, out } = await runScript(SHIP_SCRIPT, task, { env });
    expect(code).toBe(1);
    expect(whyItDidNotShip(out).died).toBe(false);
    expect(failureNote(out)).toContain('tests/the-real-reason.test.mjs');
    expect(out).toContain('that push was refused rather than raced');
  });

  it('keeps the end after a short run too', async () => {
    repoWhoseHookSays(2 * 1024, ' FAIL  tests/the-real-reason.test.mjs > it broke\n');
    const { out } = await runScript(SHIP_SCRIPT, task, { env });
    expect(failureNote(out)).toContain('tests/the-real-reason.test.mjs');
  });

  it('ends on its own refusal when the hook names nothing', async () => {
    repoWhoseHookSays(3 * 1024 * 1024, ' at Ri');
    const { out } = await runScript(SHIP_SCRIPT, task, { env });
    expect(whyItDidNotShip(out).last).toMatch(/push was refused/);
  });
});
