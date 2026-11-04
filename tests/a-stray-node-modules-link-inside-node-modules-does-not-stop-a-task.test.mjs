// A STRAY NODE_MODULES LINK INSIDE NODE_MODULES DOES NOT STOP A TASK (w-e2c6d285c3, 2026-11-04).
//
// What broke: every task in one project failed to start with "the default list
// names files this folder could not be given: node_modules/node_modules: it is
// a link that leads out of this folder". `ln -s <somewhere>/node_modules
// node_modules`, run where node_modules already exists, makes that link inside
// it. Node never looks in a node_modules directly inside another one, so the
// link is left out of the task's copy. Reproduced here with a relative and an
// absolute stray link, in a real node_modules and in one reached through a link.
import { it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { carryLocalFiles } from '../main/worktree-include.mts';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });

const setUp = ({ linked = false } = {}) => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'stray-deps-')));
  dirs.push(base);
  const repo = path.join(base, 'project');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
  git(repo, 'add', '.');
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'init');
  const deps = linked ? path.join(base, 'main-checkout', 'node_modules') : path.join(repo, 'node_modules');
  fs.mkdirSync(path.join(deps, 'left-pad'), { recursive: true });
  fs.writeFileSync(path.join(deps, 'left-pad', 'index.js'), 'module.exports = 1;\n');
  if (linked) fs.symlinkSync('../main-checkout/node_modules', path.join(repo, 'node_modules'));
  const folder = path.join(base, 'task');
  git(repo, 'worktree', 'add', '-q', folder);
  return { base, repo, folder, deps };
};

const carriedWithoutTheStray = ({ folder, deps }) => {
  const there = path.join(folder, 'node_modules');
  expect(fs.readFileSync(path.join(there, 'left-pad', 'index.js'), 'utf8')).toBe('module.exports = 1;\n');
  expect(fs.existsSync(path.join(there, 'node_modules'))).toBe(false);
  expect(fs.lstatSync(path.join(deps, 'node_modules')).isSymbolicLink()).toBe(true);
};

it('starts when node_modules holds a relative node_modules link that leads out', () => {
  const at = setUp();
  fs.symlinkSync('../../../node_modules', path.join(at.deps, 'node_modules'));
  expect(carryLocalFiles(at.repo, at.folder).carried).toEqual(['node_modules']);
  carriedWithoutTheStray(at);
});

it('starts when the stray link is absolute', () => {
  const at = setUp();
  fs.symlinkSync(at.deps, path.join(at.deps, 'node_modules'));
  carryLocalFiles(at.repo, at.folder);
  carriedWithoutTheStray(at);
});

it('starts when the stray link is in a node_modules the project reaches through a link', () => {
  const at = setUp({ linked: true });
  fs.symlinkSync('../../project/node_modules', path.join(at.deps, 'node_modules'));
  carryLocalFiles(at.repo, at.folder);
  carriedWithoutTheStray(at);
});

it('still refuses a package link that leads out', () => {
  const at = setUp();
  fs.symlinkSync('../../../elsewhere', path.join(at.deps, 'left-pad-link'));
  expect(() => carryLocalFiles(at.repo, at.folder)).toThrow(/node_modules\/left-pad-link: it is a link that leads out of this folder/);
});

it("still refuses a package's own node_modules link that leads out, which Node does read", () => {
  const at = setUp();
  fs.symlinkSync('../../../../elsewhere', path.join(at.deps, 'left-pad', 'node_modules'));
  expect(() => carryLocalFiles(at.repo, at.folder)).toThrow(/node_modules\/left-pad\/node_modules: it is a link that leads out of this folder/);
});
