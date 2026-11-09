// A REPOSITORY'S .git FOLDER IS NEVER A PROJECT (F-157, F-158, F-159).
//
// What broke: on Linux the GTK folder chooser autocompletes a typed repo path
// to `<repo>/.git/` on Enter. Open then handed back `<repo>/.git`, the app
// stored it as a project called "Git", and the first task ran `git init`
// inside the real repository's .git folder, committed git's internals as
// "First commit, made by Agentbox" and worked on that copy. A second pick,
// typed after a prefilled `.git/`, came back as
// `<repo>/.git/workspace/.../caps-js`: a folder that did not exist, which the
// store then created inside the other repository's .git.
//
// Measured by QA on main 2fba0da6 (Debian 13, Oct 29 2026) and by these tests
// failing on this branch before the fix.
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkProjectFolder, chooserStartsIn, folderFromChooser } from '../shared/project-folder-check.mts';
import { ensureTaskFolder } from '../main/task-folders.mts';

const HOME = '/home/box';
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

const made = [];
const tmp = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const aRepo = () => {
  const dir = tmp('a-repo-');
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = 1;\n');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'first');
  return dir;
};

describe('the check on a project folder', () => {
  it('turns down a .git folder and anything inside one', () => {
    for (const p of [`${HOME}/code/app/.git`, `${HOME}/code/app/.git/`, `${HOME}/code/app/.git/workspace/caps-js`]) {
      const r = checkProjectFolder(p, { home: HOME });
      expect(r.ok, p).toBe(false);
      expect(r.reason, p).toBe('git');
    }
  });

  it('still takes folders whose names only look like .git', () => {
    for (const p of [`${HOME}/code/app.git`, `${HOME}/code/.github`, `${HOME}/code/.gitlab/app`, `${HOME}/code/app`]) {
      expect(checkProjectFolder(p, { home: HOME }).ok, p).toBe(true);
    }
  });
});

describe('what the chooser hands back', () => {
  it('takes the repository when the pick is its .git folder', () => {
    const repo = aRepo();
    expect(folderFromChooser(path.join(repo, '.git'), { home: HOME, isDir })).toEqual({ path: repo });
    expect(folderFromChooser(`${repo}/.git/`, { home: HOME, isDir })).toEqual({ path: repo });
  });

  it('turns down a path inside a .git folder rather than guessing which repo was meant', () => {
    const repo = aRepo();
    const r = folderFromChooser(path.join(repo, '.git', 'workspace', 'caps-js'), { home: HOME, isDir });
    expect(r.path).toBeNull();
    expect(r.refused).toMatch(/\.git/);
  });

  it('turns down a folder that does not exist, and creates nothing', () => {
    const parent = tmp('chooser-');
    const missing = path.join(parent, 'not-here', 'caps-js');
    const r = folderFromChooser(missing, { home: HOME, isDir });
    expect(r.path).toBeNull();
    expect(r.refused).toMatch(/does not exist/);
    expect(fs.existsSync(path.join(parent, 'not-here'))).toBe(false);
  });

  it('takes an ordinary folder as it is', () => {
    const dir = tmp('plain-');
    expect(folderFromChooser(dir, { home: HOME, isDir })).toEqual({ path: dir });
  });
});

describe('where the chooser opens', () => {
  it('opens beside the repository, not inside it, when a stored project is a .git folder', () => {
    const order = chooserStartsIn(null, { known: ['/home/box/repos/initials-js/.git'], home: HOME });
    expect(order[0]).toBe('/home/box/repos');
  });
});

describe('a task for a project stored as a .git folder', () => {
  it('is refused, and nothing is written inside the .git folder', () => {
    const repo = aRepo();
    const gitDir = path.join(repo, '.git');
    const before = fs.readdirSync(gitDir).sort();
    expect(() => ensureTaskFolder(gitDir, 'w-git', { dependencies: false })).toThrow(/\.git/);
    expect(fs.readdirSync(gitDir).sort()).toEqual(before);
    expect(git(repo, 'rev-list', '--count', 'HEAD')).toBe('1');
  });

  it('a folder made inside a .git folder is refused the same way', () => {
    const repo = aRepo();
    const inside = path.join(repo, '.git', 'workspace', 'caps-js');
    fs.mkdirSync(inside, { recursive: true });
    expect(() => ensureTaskFolder(inside, 'w-inside', { dependencies: false })).toThrow(/\.git/);
    expect(fs.existsSync(path.join(inside, '.git'))).toBe(false);
  });
});
