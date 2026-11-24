// The ship checked the private checkout's git settings against the app
// folder's copy, then ran status, add, commit, fetch, rebase and push in that
// checkout, and git read its settings again each time. A Codex worker can write
// a git folder nested in its task folder, so one of its processes still
// running at ship time could plant a setting between the check and the use.
// Found 2026-11-21, confirmed 2026-11-22 on the condition that such a process
// is alive. Measured here with a stand-in git that plants core.fsmonitor and a
// signing program the moment after the check: before, both ran.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pushPrivateFolder } from '../scripts/lib/private-folder.mjs';

const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const env = { ...process.env, GIT_AUTHOR_NAME: 'Someone', GIT_AUTHOR_EMAIL: 'someone@example.com', GIT_COMMITTER_NAME: 'Someone', GIT_COMMITTER_EMAIL: 'someone@example.com' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();

/** A remote, the app folder's private checkout, and a task folder's copy of it. */
function world() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'private-race-')));
  made.push(dir);
  const remote = path.join(dir, 'private.git');
  const seed = path.join(dir, 'seed');
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dir, 'clone', '-q', remote, seed);
  put(path.join(seed, 'unslop/SKILL.md'), 'one\n');
  git(seed, 'add', '-A');
  git(seed, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
  git(seed, 'push', '-q', 'origin', 'HEAD:main');
  const named = JSON.stringify({ path: '.claude/skills', url: remote });
  const checkout = (folder: string) => {
    put(path.join(folder, '.agentbox/private.json'), named);
    const at = path.join(folder, '.claude/skills');
    git(dir, 'clone', '-q', remote, at);
    git(at, 'config', 'commit.gpgsign', 'false');
    return at;
  };
  const app = path.join(dir, 'app');
  checkout(app);
  fs.symlinkSync(path.resolve(import.meta.dirname, '..', 'scripts'), path.join(app, 'scripts'));
  const task = path.join(dir, 'task');
  const at = checkout(task);
  return { dir, remote, app, task, at };
}

/** A git that, the first time it is run, plants settings in the checkout and then does its job. */
function raceAfterTheCheck(w: ReturnType<typeof world>) {
  const ran = path.join(w.dir, 'planted-ran');
  const planted = path.join(w.dir, 'planted.sh');
  fs.writeFileSync(planted, `#!/bin/sh\necho "$0 $*" >> "${ran}"\nexit 1\n`, { mode: 0o755 });
  const bin = path.join(w.dir, 'bin');
  const once = path.join(w.dir, 'planted-once');
  put(path.join(bin, 'git'), [
    '#!/bin/sh',
    `if [ ! -f "${once}" ]; then`,
    `  : > "${once}"`,
    `  printf '[core]\\n\\tfsmonitor = ${planted}\\n[commit]\\n\\tgpgsign = true\\n[gpg]\\n\\tprogram = ${planted}\\n' >> "${path.join(w.at, '.git', 'config')}"`,
    'fi',
    `exec "${realGit}" "$@"`,
  ].join('\n') + '\n');
  fs.chmodSync(path.join(bin, 'git'), 0o755);
  return { ran, env: { ...env, PATH: `${bin}:${env.PATH}` } };
}

describe('the private push', () => {
  it('runs nothing a setting planted after the check names, and still pushes', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    const race = raceAfterTheCheck(w);
    const r = pushPrivateFolder(w.task, { message: 'Changes from agentbox/w-1', env: race.env, trusted: w.app });
    expect(fs.existsSync(race.ran) ? fs.readFileSync(race.ran, 'utf8') : '').toBe('');
    expect(r).toMatchObject({ pushed: true, commits: 1 });
    expect(git(w.remote, 'show', 'main:unslop/SKILL.md')).toBe('two');
  });

  it('leaves the checkout at what it pushed, so the next ship finds nothing left over', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    expect(pushPrivateFolder(w.task, { message: 'First', env, trusted: w.app })).toMatchObject({ pushed: true });
    expect(git(w.at, 'status', '--porcelain')).toBe('');
    expect(git(w.at, 'rev-parse', 'HEAD')).toBe(git(w.remote, 'rev-parse', 'main'));
    expect(pushPrivateFolder(w.task, { message: 'Second', env, trusted: w.app })).toEqual({ pushed: false });
    put(path.join(w.at, 'unslop/SKILL.md'), 'three\n');
    expect(pushPrivateFolder(w.task, { message: 'Third', env, trusted: w.app })).toMatchObject({ pushed: true, commits: 1 });
    expect(git(w.remote, 'log', '--format=%s', 'main').split('\n').slice(0, 2)).toEqual(['Third', 'First']);
  });

  // As inside the push hook's sandbox, where these tests run at ship.
  it.runIf(process.platform !== 'darwin' && process.getuid?.() !== 0)('still pushes when the cache cannot be written', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    const shut = path.join(w.dir, 'shut-cache');
    fs.mkdirSync(shut, { mode: 0o555 });
    const was = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = shut;
    try {
      expect(pushPrivateFolder(w.task, { message: 'Through', env, trusted: w.app })).toMatchObject({ pushed: true, commits: 1 });
    } finally {
      if (was === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = was;
      fs.chmodSync(shut, 0o755);
    }
    expect(git(w.remote, 'log', '-1', '--format=%s', 'main')).toBe('Through');
  });

  it('keeps a commit it made when the push is refused, for the next ship to send', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    fs.chmodSync(path.join(w.remote, 'objects'), 0o555);
    try {
      expect(pushPrivateFolder(w.task, { message: 'Kept', env, trusted: w.app }).pushed).toBe(false);
    } finally { fs.chmodSync(path.join(w.remote, 'objects'), 0o755); }
    expect(git(w.at, 'log', '-1', '--format=%s')).toBe('Kept');
    expect(git(w.at, 'status', '--porcelain')).toBe('');
  });
});
