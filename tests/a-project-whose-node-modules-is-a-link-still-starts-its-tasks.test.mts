// A PROJECT WHOSE NODE_MODULES IS A LINK STILL STARTS ITS TASKS (w-31c71743b5, 2026-10-29).
//
// What broke: the founder made her first project, in the new first run, from a
// git worktree of another checkout, whose node_modules is a link to that
// checkout's (`../agentbox-team/node_modules`). The first task she sent never
// started: "Could not make a folder ... node_modules: it is a link to somewhere
// outside the repository". A link out of the folder cannot be carried as a
// link, since every task would then share one node_modules, so what it points
// at is copied instead (a clone on APFS, so it costs no disk).
import { it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { carryLocalFiles } from '../main/worktree-include.mts';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });

const setUp = () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'linked-deps-')));
  dirs.push(base);
  const shared = path.join(base, 'main-checkout', 'node_modules', 'left-pad');
  fs.mkdirSync(shared, { recursive: true });
  fs.writeFileSync(path.join(shared, 'index.js'), 'module.exports = 1;\n');
  const repo = path.join(base, 'the-worktree');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
  git(repo, 'add', '.');
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'init');
  fs.symlinkSync('../main-checkout/node_modules', path.join(repo, 'node_modules'));
  const folder = path.join(base, 'task');
  git(repo, 'worktree', 'add', '-q', folder);
  return { repo, folder, shared };
};

it('copies what a node_modules link points at into the task folder', () => {
  const { repo, folder } = setUp();
  expect(carryLocalFiles(repo, folder).carried).toEqual(['node_modules']);
  const there = path.join(folder, 'node_modules');
  expect(fs.lstatSync(there).isSymbolicLink()).toBe(false);
  expect(fs.readFileSync(path.join(there, 'left-pad', 'index.js'), 'utf8')).toBe('module.exports = 1;\n');
});

it('so a change in the task folder does not reach the checkout it came from', () => {
  const { repo, folder, shared } = setUp();
  carryLocalFiles(repo, folder);
  fs.writeFileSync(path.join(folder, 'node_modules', 'left-pad', 'index.js'), 'changed\n');
  expect(fs.readFileSync(path.join(shared, 'index.js'), 'utf8')).toBe('module.exports = 1;\n');
});

it('still refuses a link that points at nothing', () => {
  const { repo, folder } = setUp();
  fs.rmSync(path.join(repo, 'node_modules'));
  fs.symlinkSync('../nowhere/node_modules', path.join(repo, 'node_modules'));
  expect(() => carryLocalFiles(repo, folder)).toThrow(/link to somewhere outside the repository/);
});
