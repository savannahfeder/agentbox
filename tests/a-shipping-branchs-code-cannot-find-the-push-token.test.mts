// A SHIPPING BRANCH'S CODE CANNOT FIND THE PUSH TOKEN.
//
// What broke: the GitHub token a ship pushes with sat in the environment of
// the ship script and of git while the push hook ran the branch's own tests,
// as the user and outside any sandbox. The hook drops git's variables before
// the tests, but a test can still list the environment of every process of
// the same user (`ps axeww`), and the token was there. Reproduced with a dummy
// token on 2026-11-17 (reports/security-review-2026-11-17.md).
//
// Measured by running the real scripts/ship.mjs against a local git server
// that asks for a sign-in the way GitHub does, with a push hook that lists
// every process's environment and reads whatever the push left open to it,
// counting where the token turns up.
// The token now goes to the ship script on its stdin and to git's credential
// helper through a file only that push holds, emptied once read.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScript } from '../main/ship-queue.mts';
import { pushRun, SIGN_IN_ON_STDIN } from '../main/github-push-sign-in.mts';
import { gitServer } from './lib/a-git-server-that-asks-for-a-sign-in.mts';

const SHIP_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ship.mjs');
const TOKEN = 'ghp_dummy-token-for-this-test-4471';
let tmp: string; let task: string; let base: string; let server: http.Server; let site: string; let globalConfig: string;
let seen: string; let leftOpen: string;

const env = () => ({ ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' });
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...env(), GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
const pushed = () => execFileSync('git', ['--git-dir', path.join(tmp, 'origin.git'), 'log', '-1', '--format=%s', 'main'], { encoding: 'utf8' }).trim();

async function setUp({ fetchToo = false } = {}) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-token-'));
  globalConfig = path.join(tmp, 'gitconfig');
  fs.writeFileSync(globalConfig, '');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  git(path.join(tmp, 'origin.git'), 'config', 'http.receivepack', 'true');
  server = gitServer(tmp, { token: TOKEN, fetchToo });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  base = path.join(tmp, 'base');
  git(tmp, 'init', '-q', '-b', 'main', 'base');
  git(base, 'config', 'user.email', 'test@example.com');
  git(base, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(base, 'readme.txt'), 'hello\n');
  git(base, 'add', '.');
  git(base, 'commit', '-q', '-m', 'init');
  git(base, 'push', '-q', path.join(tmp, 'origin.git'), 'main');
  git(base, 'remote', 'add', 'origin', `${site}/origin.git`);
  task = path.join(tmp, 'w-mine');
  git(base, 'worktree', 'add', '-q', '-b', 'agentbox/w-mine', task, 'main');
  fs.writeFileSync(path.join(task, 'notes.txt'), 'mine\n');
  git(task, 'add', '.');
  git(task, 'commit', '-q', '-m', 'A file of its own');
  // Stands in for the branch's tests: what any process of this user could read while they run.
  // Counts only, so no environment of this machine lands in a test's output.
  const pattern = path.join(tmp, 'token-pattern');
  fs.writeFileSync(pattern, `${TOKEN}\n`);
  seen = path.join(tmp, 'every-environment');
  leftOpen = path.join(tmp, 'left-open');
  const hooks = path.join(base, 'scripts', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(hooks, 'pre-push'), [
    '#!/bin/sh',
    `ps axeww | grep -c pre-push > ${JSON.stringify(seen)}`,
    `ps axeww | grep -c -F -f ${JSON.stringify(pattern)} >> ${JSON.stringify(seen)}`,
    `for fd in 3 4 5 6 7 8 9; do [ -f /dev/fd/$fd ] && cat /dev/fd/$fd; done 2>/dev/null | grep -c -F -f ${JSON.stringify(pattern)} > ${JSON.stringify(leftOpen)}`,
    'exit 0', '',
  ].join('\n'), { mode: 0o755 });
}

afterEach(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ship = (script = SHIP_SCRIPT) => {
  const run = pushRun(script, TOKEN, site);
  return runScript(script, task, { env: { ...env(), ...run.env }, gitConfig: run.gitConfig, ...(run.stdin ? { stdin: run.stdin } : {}), base, timeout: 60_000 });
};

describe('a ship with the GitHub sign-in saved on this computer', () => {
  beforeEach(() => setUp());

  it('pushes', async () => {
    const { code, out } = await ship();
    expect(out).toContain('ship: shipped');
    expect(code).toBe(0);
    expect(pushed()).toBe('A file of its own');
  }, 60_000);

  it('leaves the token in no process environment while the hook runs', async () => {
    await ship();
    const [hooks, withToken] = fs.readFileSync(seen, 'utf8').trim().split('\n').map(Number);
    expect(hooks).toBeGreaterThan(0);
    expect(withToken).toBe(0);
  }, 60_000);

  it('leaves the hook nothing to read from what the push holds open', async () => {
    await ship();
    expect(Number(fs.readFileSync(leftOpen, 'utf8').trim())).toBe(0);
  }, 60_000);

  it('is still refused with a token GitHub does not take', async () => {
    const run = pushRun(SHIP_SCRIPT, 'ghp_wrong', site);
    const { code } = await runScript(SHIP_SCRIPT, task, { env: { ...env(), ...run.env }, gitConfig: run.gitConfig, ...(run.stdin ? { stdin: run.stdin } : {}), base });
    expect(code).not.toBe(0);
    expect(pushed()).toBe('init');
  }, 60_000);
});

describe('a private repository, whose fetch asks for the sign-in too', () => {
  beforeEach(() => setUp({ fetchToo: true }));

  it('fetches and pushes, with the token in no environment', async () => {
    const { code, out } = await ship();
    expect(out).toContain('ship: shipped');
    expect(code).toBe(0);
    expect(fs.readFileSync(seen, 'utf8').trim().split('\n').map(Number)[1]).toBe(0);
  }, 60_000);
});

// Another project's own ship script knows nothing of stdin, so it keeps the
// sign-in it always had rather than losing its pushes.
describe('a ship script that does not read the sign-in from stdin', () => {
  beforeEach(() => setUp());

  it('still pushes with the sign-in', async () => {
    const old = path.join(tmp, 'old-ship.mjs');
    fs.writeFileSync(old, fs.readFileSync(SHIP_SCRIPT, 'utf8').replaceAll(SIGN_IN_ON_STDIN, 'nothing here'));
    fs.symlinkSync(path.join(path.dirname(SHIP_SCRIPT), 'lib'), path.join(tmp, 'lib'));
    const { code, out } = await ship(old);
    expect(out).toContain('ship: shipped');
    expect(code).toBe(0);
  }, 60_000);
});

describe('the ship script the app runs', () => {
  it('says it reads the sign-in from stdin', () => {
    expect(fs.readFileSync(SHIP_SCRIPT, 'utf8')).toContain(SIGN_IN_ON_STDIN);
  });
});
