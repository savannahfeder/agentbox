// Power testers (2026-11-16) ran every thread in Agentbox Cloud. A finished
// thread's answer named a file it had committed on its branch, and the pane
// beside the chat opened something else: README.md, postgres-17-estimate.md
// and a test file opened as main's copy, "Edited 2 hours ago", without the
// thread's change (3 times); shutdown-repro.md said "is not in Infra"; and
// deploy-lock-design.md and a saved -v2 sat on a loading skeleton for good.
// Measured on the pane and the finder: the pane asked for the file without
// saying which thread it was in, so a thread's branch was never read; the
// finder read the branch only once nothing of that name was anywhere else, and
// only at the exact path; and a call that failed left the pane waiting.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact } from '../main/artifact-path.mts';
import { taskBranch } from '../main/task-folders.mts';
import { paneCanSave } from '../renderer/src/doc-pane.ts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const commit = (cwd: string, files: Record<string, string>, msg: string) => {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
    fs.writeFileSync(path.join(cwd, name), text);
  }
  git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', msg);
};

let root = '', repo = '', dir = '';
const finished = 'w-47d934d0aa';
const merged = 'w-8340ad8bb1';
const running = 'w-938ab4c4e4';

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-branch-file-')));
  repo = path.join(root, 'infra');
  dir = path.join(root, 'docs');
  fs.mkdirSync(repo); fs.mkdirSync(dir);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'a@b.c'); git(repo, 'config', 'user.name', 'A');
  commit(repo, { 'README.md': 'three tests pass\n', 'net.test.cjs': 'old\n' }, 'seed');
  // Came home from the cloud as its branch, folder given back.
  git(repo, 'checkout', '-qb', taskBranch(finished));
  commit(repo, { 'README.md': 'four tests pass\nGET /health\n', 'docs/ops/shutdown-repro.md': 'SIGTERM repro\n' }, 'readme');
  git(repo, 'checkout', '-q', 'main');
  // Shipped into main, and main moved on after it.
  git(repo, 'checkout', '-qb', taskBranch(merged));
  commit(repo, { 'net.test.cjs': 'eleven tests\n' }, 'tests');
  git(repo, 'checkout', '-q', 'main');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'ship', taskBranch(merged));
  commit(repo, { 'net.test.cjs': 'eleven tests, renamed\n' }, 'later');
  // A thread still in its folder.
  git(repo, 'worktree', 'add', '-q', '-b', taskBranch(running), path.join(repo, '.claude', 'worktrees', running));
  fs.writeFileSync(path.join(repo, '.claude', 'worktrees', running, 'README.md'), 'being written\n');
});
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

const open = async (src: string, thread: string | null) => {
  const out = await resolveArtifact({
    src, product: 'infra', products: [{ slug: 'infra', dir, name: 'Infra', repoPath: repo }] as never,
    accountRoot: root, storeRoot: root, thread, fresh: true,
  });
  return out.ok ? fs.readFileSync(out.path!, 'utf8') : `not found: ${out.error}`;
};

describe('a file a finished thread committed on its branch', () => {
  it('opens as the branch has it, not as main has it', async () => {
    expect(await open('README.md', finished)).toBe('four tests pass\nGET /health\n');
  });

  it('opens when the answer names it without its folders', async () => {
    expect(await open('shutdown-repro.md', finished)).toBe('SIGTERM repro\n');
    expect(await open('ops/shutdown-repro.md', finished)).toBe('SIGTERM repro\n');
  });

  it('opens as main has it once the branch is in main', async () => {
    expect(await open('net.test.cjs', merged)).toBe('eleven tests, renamed\n');
  });

  it('a file the thread never touched opens as main has it now, not as its branch began', async () => {
    expect(await open('net.test.cjs', finished)).toBe('eleven tests, renamed\n');
  });

  it('opens as main has it from another thread, or from none', async () => {
    expect(await open('README.md', 'w-0000000001')).toBe('three tests pass\n');
    expect(await open('README.md', null)).toBe('three tests pass\n');
  });

  it('opens from the thread\'s folder while it has one', async () => {
    expect(await open('README.md', running)).toBe('being written\n');
  });

  it('a name the branch does not hold is still not found', async () => {
    expect(await open('missing.md', finished)).toMatch(/^not found: missing\.md is not in Infra/);
  });
});

// Round four: an answer linked docs/website-launch-checklist.md by its full
// path inside the thread's folder. The thread had merged and its folder was
// given back, so the link opened an empty document though main held the file.
describe('a link by full path into a thread folder that was given back', () => {
  const inFolder = (id: string, rel: string) => path.join(repo, '.claude', 'worktrees', id, rel);

  it('opens the file from the thread\'s branch while it is not merged', async () => {
    expect(await open(inFolder(finished, 'README.md'), null)).toBe('four tests pass\nGET /health\n');
  });

  it('opens the project\'s own copy once the branch is in main', async () => {
    expect(await open(inFolder(merged, 'net.test.cjs'), null)).toBe('eleven tests, renamed\n');
  });

  it('still opens the folder\'s own file while the folder is there', async () => {
    expect(await open(inFolder(running, 'README.md'), null)).toBe('being written\n');
  });

  it('matches the repository through a link to the same folder', async () => {
    const linked = path.join(root, 'linked');
    fs.symlinkSync(repo, linked);
    expect(await open(path.join(linked, '.claude', 'worktrees', merged, 'net.test.cjs'), null)).toBe('eleven tests, renamed\n');
  });
});

// The pane beside the chat. This repository has no browser to draw it in, so
// its rule is tested and its source is read.
const source = (p: string) => fs.readFileSync(path.join(import.meta.dirname, '..', p), 'utf8');

describe('the pane beside a thread', () => {
  it('asks for the file in the thread it was opened from', () => {
    const pane = source('renderer/src/components/DocPane.tsx');
    expect(pane).toMatch(/api\.resolveDoc\(\{ product: doc\.product, src: doc\.src, thread \}\)/);
    expect(pane.match(/api\.readDoc\(\{ product: doc\.product, src: doc\.src, thread \}\)/g)).toHaveLength(3);
    expect(pane.match(/api\.readDoc\(/g)).toHaveLength(3);
    expect(source('renderer/src/App.tsx')).toMatch(/<DocPane\s+doc=\{openDoc\}\s+thread=\{focused && focused\.product === openDoc\.product/);
  });

  it('saves only a file inside the project, so a branch\'s copy never goes over main\'s', () => {
    const roots = ['/docs', '/repo'];
    expect(paneCanSave(`${os.tmpdir()}/agentbox-branch-files/abc/${finished}/README.md`, roots)).toBe(false);
    expect(paneCanSave('/repo-old/README.md', roots)).toBe(false);
    expect(paneCanSave('/repo/README.md', roots)).toBe(true);
    expect(paneCanSave('/repo/.claude/worktrees/w-1/README.md', roots)).toBe(true);
    expect(paneCanSave('/docs/designs/w-1/plan.md', roots)).toBe(true);
    // Not yet found, or no project to compare with: as before.
    expect(paneCanSave(null, roots)).toBe(true);
    expect(paneCanSave('/anywhere/x.md', [])).toBe(true);
  });

  it('ends a failed or unanswered ask with words, never a skeleton for good', () => {
    const pane = source('renderer/src/components/DocPane.tsx');
    expect(pane.match(/\.catch\(unanswered\)/g)).toHaveLength(3);
    expect(pane).toMatch(/text === null \|\| \(threadsFile && liveTicket === undefined\) \? \(\s*<OpeningWait /);
    // A saved version in designs/<thread>/ waited on its live room, which may never answer.
    expect(source('renderer/src/live/live-session.ts')).toMatch(/const giveUp = window\.setTimeout\(\(\) => \{ if \(!gone\) setTicket/);
  });
});
