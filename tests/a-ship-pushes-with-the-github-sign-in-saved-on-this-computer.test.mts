// A SHIP PUSHES WITH THE GITHUB SIGN-IN SAVED ON THIS COMPUTER.
//
// What broke: three threads' ships were refused on the person's Mac with
// "fatal: could not read Username for 'https://github.com'", because git there
// had no GitHub sign-in, and nothing in the app could give it one. Measured by
// running the real scripts/ship.mjs against a local git server that refuses a
// push without a sign-in, as GitHub does: with no token the push is refused in
// those words, with the saved token it goes out, a stale password kept in
// git's own settings does not answer first, and the push hook, which drops
// the token before the tests run, does not stop it going out.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScript } from '../main/ship-queue.mts';
import { pushConfig, TOKEN_VAR } from '../main/github-push-sign-in.mts';
import { gitServer } from './lib/a-git-server-that-asks-for-a-sign-in.mts';

const SHIP_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ship.mjs');
const TOKEN = 'ghp_the-right-one';
let tmp; let task; let server; let site; let hookSaw; let globalConfig;

const env = () => ({ ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1', [TOKEN_VAR]: '' });
// What the real push hook does before its tests (scripts/hooks/pre-push).
const DROPS_GIT_VARIABLES = 'for v in $(env | sed -n \'s/^\\(GIT_[A-Za-z0-9_]*\\)=.*/\\1/p\'); do\n  unset "$v"\ndone';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...env(), GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-signin-'));
  globalConfig = path.join(tmp, 'gitconfig');
  fs.writeFileSync(globalConfig, '');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  git(path.join(tmp, 'origin.git'), 'config', 'http.receivepack', 'true');
  server = gitServer(tmp, { token: TOKEN });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  site = `http://127.0.0.1:${server.address().port}`;
  const base = path.join(tmp, 'base');
  git(tmp, 'init', '-q', '-b', 'main', 'base');
  git(base, 'config', 'user.email', 'test@example.com');
  git(base, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(base, 'readme.txt'), 'hello\n');
  git(base, 'add', '.');
  git(base, 'commit', '-q', '-m', 'init');
  git(base, 'push', '-q', path.join(tmp, 'origin.git'), 'main');
  // Nothing here may talk to the server: a call that waits holds up the server answering it.
  git(base, 'remote', 'add', 'origin', `${site}/origin.git`);
  task = path.join(tmp, 'w-mine');
  git(base, 'worktree', 'add', '-q', '-b', 'agentbox/w-mine', task, 'main');
  fs.writeFileSync(path.join(task, 'notes.txt'), 'mine\n');
  git(task, 'add', '.');
  git(task, 'commit', '-q', '-m', 'A file of its own');
  // Like the real hook: drops git's variables first, then says what it could still see of the token.
  const hooks = path.join(base, 'scripts', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  hookSaw = path.join(tmp, 'hook-saw');
  fs.writeFileSync(path.join(hooks, 'pre-push'), `#!/bin/sh\n${DROPS_GIT_VARIABLES}\necho "\${${TOKEN_VAR}:-nothing}" > ${JSON.stringify(hookSaw)}\nexit 0\n`, { mode: 0o755 });
});
afterEach(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const pushed = () => execFileSync('git', ['--git-dir', path.join(tmp, 'origin.git'), 'log', '-1', '--format=%s', 'main'], { encoding: 'utf8' }).trim();

describe('a ship from a computer with no GitHub sign-in', () => {
  it('is refused in the words the app looks for', async () => {
    const { code, out } = await runScript(SHIP_SCRIPT, task, { env: env() });
    expect(code).not.toBe(0);
    expect(out).toMatch(/^fatal: could not read Username for 'http:\/\/127\.0\.0\.1/m);
    expect(pushed()).toBe('init');
  }, 60_000);
});

describe('a ship with the sign-in saved on this computer', () => {
  it('pushes, and the hook that dropped the token does not stop it', async () => {
    const { code, out } = await runScript(SHIP_SCRIPT, task, { env: { ...env(), [TOKEN_VAR]: TOKEN }, gitConfig: pushConfig(site) });
    expect(out).toContain('ship: shipped');
    expect(code).toBe(0);
    expect(pushed()).toBe('A file of its own');
    expect(fs.readFileSync(hookSaw, 'utf8').trim()).toBe('nothing');
  }, 60_000);

  it('pushes even when git keeps a stale password of its own', async () => {
    const stale = path.join(tmp, 'stale-helper.sh');
    fs.writeFileSync(stale, '#!/bin/sh\ntest "$1" = get && printf "username=x-access-token\\npassword=stale\\n"\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(globalConfig, `[credential]\n\thelper = ${stale}\n`);
    const { code, out } = await runScript(SHIP_SCRIPT, task, { env: { ...env(), [TOKEN_VAR]: TOKEN }, gitConfig: pushConfig(site) });
    expect(out).toContain('ship: shipped');
    expect(code).toBe(0);
  }, 60_000);

  it('is still refused with a token GitHub does not take', async () => {
    const { code } = await runScript(SHIP_SCRIPT, task, { env: { ...env(), [TOKEN_VAR]: 'ghp_wrong' }, gitConfig: pushConfig(site) });
    expect(code).not.toBe(0);
    expect(pushed()).toBe('init');
  }, 60_000);
});

// A ship of this change once stopped at 20 minutes: it edited the push hook to drop the token,
// and any change to scripts/hooks/ makes that hook run the whole suite.
describe('the token a ship pushes with', () => {
  it('is a name the push hook already drops before its tests run', () => {
    const hook = fs.readFileSync(path.resolve(path.dirname(SHIP_SCRIPT), 'hooks', 'pre-push'), 'utf8');
    expect(hook).toContain(DROPS_GIT_VARIABLES);
    expect(TOKEN_VAR).toMatch(/^GIT_[A-Z0-9_]+$/);
    expect(hook).not.toContain(TOKEN_VAR);
  });
});

describe('the config a ship pushes with', () => {
  it('sends a push to GitHub over ssh through the same sign-in', () => {
    const repo = path.join(tmp, 'ssh-remote');
    git(tmp, 'init', '-q', 'ssh-remote');
    git(repo, 'remote', 'add', 'origin', 'git@github.com:someone/somewhere.git');
    const pairs = pushConfig();
    const cfg = { GIT_CONFIG_COUNT: String(pairs.length), ...Object.fromEntries(pairs.flatMap(([k, v], i) => [[`GIT_CONFIG_KEY_${i}`, k], [`GIT_CONFIG_VALUE_${i}`, v]])) };
    const url = execFileSync('git', ['remote', 'get-url', '--push', 'origin'], { cwd: repo, encoding: 'utf8', env: { ...env(), ...cfg } }).trim();
    expect(url).toBe('https://github.com/someone/somewhere.git');
  });
});
