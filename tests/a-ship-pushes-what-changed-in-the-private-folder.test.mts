// The skills and plans are a private repository checked out at `.claude/skills`
// (2026-11-19), which the public branch ignores. A skill an agent edited in its
// task folder would be lost with the folder, so the ship commits and pushes
// what is left there to the private repository's main, whatever the public
// push then does.

import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pushPrivateFolder } from '../scripts/lib/private-folder.mjs';
import { gitServer } from './lib/a-git-server-that-asks-for-a-sign-in.mts';

const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const env = { ...process.env, GIT_AUTHOR_NAME: 'Someone', GIT_AUTHOR_EMAIL: 'someone@example.com', GIT_COMMITTER_NAME: 'Someone', GIT_COMMITTER_EMAIL: 'someone@example.com' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

function world({ named = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'private-push-'));
  made.push(dir);
  const remote = path.join(dir, 'private.git');
  const seed = path.join(dir, 'seed');
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dir, 'clone', '-q', remote, seed);
  put(path.join(seed, 'unslop/SKILL.md'), 'one\n');
  git(seed, 'add', '-A');
  git(seed, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
  git(seed, 'push', '-q', 'origin', 'HEAD:main');
  const folder = path.join(dir, 'task');
  fs.mkdirSync(folder);
  // Its push runs this checkout's gate (scripts/private-push-gate.mjs).
  fs.symlinkSync(path.resolve(import.meta.dirname, '..', 'scripts'), path.join(folder, 'scripts'));
  if (named) put(path.join(folder, '.agentbox/private.json'), JSON.stringify({ path: '.claude/skills', url: remote }));
  const at = path.join(folder, '.claude/skills');
  git(dir, 'clone', '-q', remote, at);
  git(at, 'config', 'commit.gpgsign', 'false');
  return { remote, seed, folder, at };
}

const remoteLog = (remote: string) => git(remote, 'log', '--format=%s', 'main');

describe('a ship and the private folder', () => {
  it('commits and pushes an edit nobody committed', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    const r = pushPrivateFolder(w.folder, { message: 'Changes from agentbox/w-1', env });
    expect(r).toMatchObject({ pushed: true, commits: 1 });
    expect(remoteLog(w.remote).split('\n')[0]).toBe('Changes from agentbox/w-1');
    expect(git(w.remote, 'show', 'main:unslop/SKILL.md')).toBe('two');
  });

  it('pushes commits an agent made and did not push', () => {
    const w = world();
    put(path.join(w.at, 'handoff/SKILL.md'), 'new\n');
    git(w.at, 'add', '-A');
    git(w.at, 'commit', '-q', '-m', 'A new skill');
    const r = pushPrivateFolder(w.folder, { message: 'unused', env });
    expect(r.why).toBeUndefined();
    expect(r).toMatchObject({ pushed: true, commits: 1 });
    expect(remoteLog(w.remote).split('\n')[0]).toBe('A new skill');
  });

  // main went red once on a Mac with { pushed: false, why } on the test above.
  // A warning git writes is not a change in the folder or a count of commits.
  it('pushes when git warns about something else while it reads the folder', () => {
    const w = world();
    const unreadable = path.join(path.dirname(w.folder), 'config-home', 'git', 'ignore');
    put(unreadable, '');
    fs.chmodSync(unreadable, 0o000);
    const warned = { ...env, XDG_CONFIG_HOME: path.dirname(path.dirname(unreadable)) };
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: w.at, env: warned, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).toBe('');
    put(path.join(w.at, 'handoff/SKILL.md'), 'new\n');
    git(w.at, 'add', '-A');
    git(w.at, 'commit', '-q', '-m', 'A new skill');
    const r = pushPrivateFolder(w.folder, { message: 'unused', env: warned });
    expect(r.why).toBeUndefined();
    expect(r).toMatchObject({ pushed: true, commits: 1 });
    expect(remoteLog(w.remote).split('\n')[0]).toBe('A new skill');
  });

  it('puts its commits after what somebody else pushed meanwhile', () => {
    const w = world();
    put(path.join(w.seed, 'other/SKILL.md'), 'theirs\n');
    git(w.seed, 'add', '-A');
    git(w.seed, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'Theirs');
    git(w.seed, 'push', '-q', 'origin', 'HEAD:main');
    put(path.join(w.at, 'unslop/SKILL.md'), 'mine\n');
    expect(pushPrivateFolder(w.folder, { message: 'Mine', env })).toMatchObject({ pushed: true });
    expect(remoteLog(w.remote).split('\n').slice(0, 2)).toEqual(['Mine', 'Theirs']);
  });

  it('does nothing when nothing changed', () => {
    const w = world();
    expect(pushPrivateFolder(w.folder, { message: 'x', env })).toEqual({ pushed: false });
    expect(remoteLog(w.remote)).toBe('first');
  });

  it('does nothing in a folder with no private folder', () => {
    const w = world({ named: false });
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    expect(pushPrivateFolder(w.folder, { message: 'x', env })).toEqual({ pushed: false });
  });

  it('says why when the push is refused, and does not throw', () => {
    const w = world();
    git(w.at, 'remote', 'set-url', 'origin', '/nowhere/at/all.git');
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    const r = pushPrivateFolder(w.folder, { message: 'x', env });
    expect(r.pushed).toBe(false);
    expect(r.why).toMatch(/could not/);
  });
});

describe('the ship script', () => {
  it('pushes the private folder before the public push', () => {
    const ship = fs.readFileSync(path.join(import.meta.dirname, '../scripts/ship.mjs'), 'utf8');
    expect(ship).toMatch(/import \{ pushPrivateFolder \} from '\.\/lib\/private-folder\.mjs'/);
    expect(ship.indexOf('pushPrivateFolder(root')).toBeGreaterThan(0);
    expect(ship.indexOf('pushPrivateFolder(root')).toBeLessThan(ship.indexOf("signedIn(['push', PUBLIC"));
  });
});

// The private repository is on GitHub, so its fetch and push need the sign-in
// the public push has, through the same file no environment holds
// (tests/a-shipping-branchs-code-cannot-find-the-push-token).
describe('a private repository that asks for the sign-in', () => {
  const TOKEN = 'ghp_dummy-private-folder-token';
  let server: http.Server | null = null;
  afterEach(async () => { if (server) await new Promise((r) => server!.close(r)); server = null; });

  async function signedWorld() {
    const w = world();
    git(w.remote, 'config', 'http.receivepack', 'true');
    server = gitServer(path.dirname(w.remote), { token: TOKEN, fetchToo: true });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    git(w.at, 'remote', 'set-url', 'origin', `${site}/private.git`);
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    return { ...w, site };
  }

  // In a process of its own: git waiting here would hold up the server answering it.
  const pushApart = (folder: string, site: string | null, childEnv: NodeJS.ProcessEnv) => new Promise<{ pushed: boolean }>((resolve, reject) => {
    const lib = path.resolve(import.meta.dirname, '..', 'scripts', 'lib');
    const code = `import { pushPrivateFolder } from ${JSON.stringify(path.join(lib, 'private-folder.mjs'))};
import { signedGit } from ${JSON.stringify(path.join(lib, 'push-sign-in.mjs'))};
const site = ${JSON.stringify(site)};
const signIn = site ? signedGit({ token: ${JSON.stringify(TOKEN)}, site }) : null;
process.stdout.write(JSON.stringify(pushPrivateFolder(${JSON.stringify(folder)}, { message: 'Signed', signIn })));`;
    execFile(process.execPath, ['--input-type=module', '-e', code], { env: childEnv, encoding: 'utf8', timeout: 60_000 }, (err, out) => (err ? reject(err) : resolve(JSON.parse(out))));
  });

  it('fetches and pushes with the ship sign-in', async () => {
    const w = await signedWorld();
    const r = await pushApart(w.folder, w.site, env);
    expect(r).toMatchObject({ pushed: true, commits: 1 });
    expect(remoteLog(w.remote).split('\n')[0]).toBe('Signed');
  });

  it('cannot reach it without one', async () => {
    const w = await signedWorld();
    const r = await pushApart(w.folder, null, { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
    expect(r.pushed).toBe(false);
    expect(remoteLog(w.remote)).toBe('first');
  });
});
