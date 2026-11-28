// The private push checks the checkout's tree for a nested repository, then
// copies its git folder and runs git status in the tree, which git reads live.
// A Codex worker can write that tree and the index, so a process of its still
// running could list a folder as a repository in the index before the check
// and drop in the one-line `.git` file after it; status then went into that
// repository and ran its core.fsmonitor program outside the sandbox. Found
// 2026-11-25 checking the 2026-11-24 fix; with git 2.39 the planted program ran.
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

function world() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'private-nested-')));
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

/**
 * A repository whose git folder sits in the tree under a name the check does
 * not look for, listed in the index at `x`, and a git that writes `x/.git`
 * pointing at it the first time it is run, as a worker's process would.
 */
function plantAfterTheCheck(w: ReturnType<typeof world>) {
  const ran = path.join(w.dir, 'planted-ran');
  const planted = path.join(w.dir, 'planted.sh');
  fs.writeFileSync(planted, `#!/bin/sh\necho "$0 $*" >> "${ran}"\nexit 1\n`, { mode: 0o755 });
  const hidden = path.join(w.at, 'notes', 'data');
  fs.mkdirSync(path.dirname(hidden), { recursive: true });
  put(path.join(w.at, 'x', 'README'), 'x\n');
  git(w.dir, 'init', '-q', `--separate-git-dir=${hidden}`, path.join(w.dir, 'scratch'));
  git(path.join(w.dir, 'scratch'), '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 's');
  const sha = git(path.join(w.dir, 'scratch'), 'rev-parse', 'HEAD');
  git(w.dir, `--git-dir=${hidden}`, 'config', 'core.fsmonitor', planted);
  git(w.at, 'update-index', '--add', '--cacheinfo', `160000,${sha},x`);
  const bin = path.join(w.dir, 'bin');
  const once = path.join(w.dir, 'planted-once');
  put(path.join(bin, 'git'), [
    '#!/bin/sh',
    `if [ ! -f "${once}" ]; then`,
    `  : > "${once}"`,
    `  printf 'gitdir: ${hidden}\\n' > "${path.join(w.at, 'x', '.git')}"`,
    'fi',
    `exec "${realGit}" "$@"`,
  ].join('\n') + '\n');
  fs.chmodSync(path.join(bin, 'git'), 0o755);
  return { ran, env: { ...env, PATH: `${bin}:${env.PATH}` } };
}

describe('the private push', () => {
  it('runs nothing from a repository that appears in the tree after the check', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    const race = plantAfterTheCheck(w);
    const r = pushPrivateFolder(w.task, { message: 'Changes from agentbox/w-1', env: race.env, trusted: w.app });
    expect(fs.existsSync(race.ran) ? fs.readFileSync(race.ran, 'utf8') : '').toBe('');
    expect(r.pushed).toBe(false);
    expect(git(w.remote, 'show', 'main:unslop/SKILL.md')).toBe('one');
  });

  it('runs nothing from a whole repository dropped in after the check that the index does not list', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    const ran = path.join(w.dir, 'planted-ran');
    const planted = path.join(w.dir, 'planted.sh');
    fs.writeFileSync(planted, `#!/bin/sh\necho "$0 $*" >> "${ran}"\nexit 1\n`, { mode: 0o755 });
    const ready = path.join(w.dir, 'ready');
    git(w.dir, 'init', '-q', ready);
    put(path.join(ready, 'f'), 'f\n');
    git(ready, 'add', '-A');
    git(ready, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 's');
    git(ready, 'config', 'core.fsmonitor', planted);
    put(path.join(ready, 'f'), 'changed\n');
    const bin = path.join(w.dir, 'bin');
    const once = path.join(w.dir, 'planted-once');
    put(path.join(bin, 'git'), [
      '#!/bin/sh',
      `if [ ! -f "${once}" ]; then`,
      `  : > "${once}"`,
      `  cp -R "${ready}" "${path.join(w.at, 'y')}"`,
      'fi',
      `exec "${realGit}" "$@"`,
    ].join('\n') + '\n');
    fs.chmodSync(path.join(bin, 'git'), 0o755);
    pushPrivateFolder(w.task, { message: 'Dropped', env: { ...env, PATH: `${bin}:${env.PATH}` }, trusted: w.app });
    expect(fs.existsSync(ran) ? fs.readFileSync(ran, 'utf8') : '').toBe('');
  });

  it('refuses a checkout whose index lists a repository, and says so', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    git(w.at, 'update-index', '--add', '--cacheinfo', `160000,${git(w.at, 'rev-parse', 'HEAD')},x`);
    const r = pushPrivateFolder(w.task, { message: 'Listed', env, trusted: w.app });
    expect(r).toMatchObject({ pushed: false, why: expect.stringContaining('repository') });
  });

  it('refuses a git folder holding a link, so an index swapped behind one is never read', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    const store = path.join(w.task, 'idx');
    fs.mkdirSync(store);
    fs.renameSync(path.join(w.at, '.git/index'), path.join(store, 'live'));
    fs.symlinkSync(path.join(store, 'live'), path.join(w.at, '.git/index'));
    const r = pushPrivateFolder(w.task, { message: 'Linked', env, trusted: w.app });
    expect(r).toMatchObject({ pushed: false, why: expect.stringContaining('a link at .git/index') });
    expect(git(w.remote, 'show', 'main:unslop/SKILL.md')).toBe('one');
  });

  it('writes nothing outside the checkout when a folder in its git folder becomes a link after the copy', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    const outside = path.join(w.dir, 'elsewhere');
    fs.mkdirSync(outside);
    put(path.join(w.at, '.git/refs/heads/authorized_keys'), 'planted\n');
    const bin = path.join(w.dir, 'bin');
    const once = path.join(w.dir, 'swapped-once');
    put(path.join(bin, 'git'), [
      '#!/bin/sh',
      `if [ ! -f "${once}" ]; then`,
      `  : > "${once}"`,
      `  rm -rf "${path.join(w.at, '.git/refs/heads')}" && ln -s "${outside}" "${path.join(w.at, '.git/refs/heads')}"`,
      'fi',
      `exec "${realGit}" "$@"`,
    ].join('\n') + '\n');
    fs.chmodSync(path.join(bin, 'git'), 0o755);
    pushPrivateFolder(w.task, { message: 'Swapped', env: { ...env, PATH: `${bin}:${env.PATH}` }, trusted: w.app });
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('does not fetch inside a repository that .gitmodules names and that appears after the check', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    const ran = path.join(w.dir, 'planted-ran');
    const planted = path.join(w.dir, 'planted.sh');
    fs.writeFileSync(planted, `#!/bin/sh\necho "$0 $*" >> "${ran}"\nexit 1\n`, { mode: 0o755 });
    put(path.join(w.at, '.gitmodules'), '[submodule "y"]\n\tpath = y\n\turl = ./y\n\tfetchRecurseSubmodules = true\n');
    const ready = path.join(w.dir, 'ready');
    git(w.dir, 'init', '-q', ready);
    put(path.join(ready, 'f'), 'f\n');
    git(ready, 'add', '-A');
    git(ready, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 's');
    git(ready, 'remote', 'add', 'origin', ready);
    git(ready, 'config', 'remote.origin.uploadpack', planted);
    const bin = path.join(w.dir, 'bin');
    const once = path.join(w.dir, 'planted-once');
    put(path.join(bin, 'git'), [
      '#!/bin/sh',
      `if [ ! -f "${once}" ]; then`,
      `  : > "${once}"`,
      `  cp -R "${ready}" "${path.join(w.at, 'y')}"`,
      'fi',
      `exec "${realGit}" "$@"`,
    ].join('\n') + '\n');
    fs.chmodSync(path.join(bin, 'git'), 0o755);
    const r = pushPrivateFolder(w.task, { message: 'Named', env: { ...env, PATH: `${bin}:${env.PATH}` }, trusted: w.app });
    expect(fs.existsSync(ran) ? fs.readFileSync(ran, 'utf8') : '').toBe('');
    expect(r.pushed).toBe(false);
  });

  it('still pushes a checkout with no repository in it', () => {
    const w = world();
    put(path.join(w.at, 'unslop/SKILL.md'), 'two\n');
    expect(pushPrivateFolder(w.task, { message: 'Plain', env, trusted: w.app })).toMatchObject({ pushed: true, commits: 1 });
    expect(git(w.remote, 'show', 'main:unslop/SKILL.md')).toBe('two');
  });
});
