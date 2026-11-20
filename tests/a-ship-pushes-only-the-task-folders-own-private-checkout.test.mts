// A worker could swap its task folder's .claude for a link to the app folder's
// .claude. The ship then compared the app folder's private checkout with itself,
// found it matched, and committed and pushed the person's own unfinished edits
// there under the branch's name. The folder's name was also read from the task's
// own .agentbox/private.json, which the worker can write. Reproduced 2026-11-20
// by calling pushPrivateFolder and the real scripts/ship.mjs on dummy repos.

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

// The app folder with its private checkout, and a task folder inside it given a copy, as on the Mac.
function world() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'private-own-')));
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
  const app = path.join(dir, 'app');
  put(path.join(app, '.agentbox/private.json'), named);
  fs.symlinkSync(path.resolve(import.meta.dirname, '..', 'scripts'), path.join(app, 'scripts'));
  const own = path.join(app, '.claude/skills');
  git(dir, 'clone', '-q', remote, own);
  git(own, 'config', 'commit.gpgsign', 'false');
  const folder = path.join(app, '.claude/worktrees/w-1');
  put(path.join(folder, '.agentbox/private.json'), named);
  fs.cpSync(own, path.join(folder, '.claude/skills'), { recursive: true, verbatimSymlinks: true });
  return { dir, remote, app, own, folder, marker: path.join(dir, 'RAN') };
}

const ship = (w: ReturnType<typeof world>, folder = w.folder) => pushPrivateFolder(folder, { message: 'Changes from agentbox/w-1', env, trusted: w.app });
const onRemote = (w: ReturnType<typeof world>) => git(w.remote, 'log', '--format=%s', 'main').split('\n');

describe('a ship pushes only the task folder\'s own private checkout', () => {
  it('leaves the app folder\'s checkout alone when the task\'s .claude links to it', () => {
    const w = world();
    put(path.join(w.own, 'half-done.md'), 'not ready\n');
    fs.rmSync(path.join(w.folder, '.claude'), { recursive: true, force: true });
    fs.symlinkSync('../../../.claude', path.join(w.folder, '.claude'));
    const r = ship(w);
    expect(r.pushed).toBe(false);
    expect(r.why).toMatch(/outside the task folder/);
    expect(onRemote(w)).toEqual(['first']);
    expect(git(w.own, 'status', '--porcelain')).toBe('?? half-done.md');
  });

  it('takes the folder\'s name from the app folder, not from what the task wrote', () => {
    const w = world();
    // Another task's copy, whose settings that task's worker could write.
    const other = path.join(w.app, '.claude/worktrees/w-2/.claude/skills');
    fs.cpSync(w.own, other, { recursive: true, verbatimSymlinks: true });
    git(other, 'config', 'core.fsmonitor', `touch '${w.marker}'; false`);
    const rel = '.claude/worktrees/w-2/.claude/skills';
    const mine = path.join(w.folder, rel);
    fs.cpSync(other, mine, { recursive: true, verbatimSymlinks: true });
    put(path.join(mine, 'unslop/SKILL.md'), 'planted\n');
    put(path.join(w.folder, '.agentbox/private.json'), JSON.stringify({ path: rel, url: 'x' }));
    put(path.join(w.folder, '.claude/skills/unslop/SKILL.md'), 'two\n');
    const r = ship(w);
    expect(fs.existsSync(w.marker)).toBe(false);
    expect(r).toMatchObject({ pushed: true, path: '.claude/skills' });
    expect(git(w.remote, 'show', 'main:unslop/SKILL.md')).toBe('two');
  });

  it('still pushes an honest copy reached through a linked path', () => {
    const w = world();
    put(path.join(w.folder, '.claude/skills/unslop/SKILL.md'), 'two\n');
    const through = path.join(w.dir, 'linked-task');
    fs.symlinkSync(w.folder, through);
    expect(ship(w, through)).toMatchObject({ pushed: true, commits: 1 });
    expect(git(w.remote, 'show', 'main:unslop/SKILL.md')).toBe('two');
  });
});
