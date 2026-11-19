// The skills and plans are a private repository checked out at `.claude/skills`
// (2026-11-19), which the public branch ignores. A skill an agent edited in its
// task folder would be lost with the folder, so the ship commits and pushes
// what is left there to the private repository's main, whatever the public
// push then does.

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
    expect(pushPrivateFolder(w.folder, { message: 'unused', env })).toMatchObject({ pushed: true, commits: 1 });
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
    expect(ship.indexOf('pushPrivateFolder(root')).toBeLessThan(ship.indexOf("runGit(['push', PUBLIC"));
  });
});
