// A HANDED-OVER THREAD CARRIES ITS CHANGE AS A PATCH (2026-11-20).
//
// On a synthetic team, Sam handed his idempotency thread to Theo. Its commit
// lived only on Sam's branch, agentbox/<thread>, in Sam's checkout. Theo's task
// carried the thread's words and the files they named, never the code: Theo's
// Codex agent could not find the commit, and the link to payments.js waited
// for a copy from a folder Sam's app had already put away. Measured on Sam's
// copy: the branch held the commits; the task body held no patch and no file.
//
// A hand-over now makes the thread's commits into one patch file (git
// format-patch from where its branch left main), sends it with the task, and
// the brief says to apply it on a branch first. A change too big to send is
// named in the brief instead of dropped. Separately, Lena's thread looked
// unchanged after Give to Sam until the cloud sync finished: the close now
// comes before the wait.
import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handedChange } from '../main/team/handed-change.mts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Sam', '-c', 'user.email=sam@team.test', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const ID = 'w-fb57b38e87';

describe('the change a hand-over carries', () => {
  let repo: string; let out: string;
  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'payments-api-'));
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'runs-'));
    git(repo, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(repo, 'server.js'), 'export const app = 1;\n');
    git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'Start');
    git(repo, 'switch', '-qc', `agentbox/${ID}`);
    fs.mkdirSync(path.join(repo, 'src'));
    fs.writeFileSync(path.join(repo, 'src', 'payments.js'), 'export const cents = (n) => Math.round(n * 100);\n');
    git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'Store payment amounts as integer cents');
    fs.writeFileSync(path.join(repo, 'src', 'payments.test.js'), 'test("cents", () => {});\n');
    git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'Test the cents store');
    git(repo, 'switch', '-q', 'main');
    // Main moves on after the branch left it; the patch is only the branch's own work.
    fs.writeFileSync(path.join(repo, 'README.md'), 'Payments\n');
    git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'Readme');
  });

  it('is a patch of the thread’s commits that applies on a fresh copy of main, the reported one', () => {
    const got = handedChange({ repoPath: repo, id: ID, owner: 'Sam', outDir: out });
    expect(got.file?.name).toBe(`${ID}.patch`);
    const patch = fs.readFileSync(got.file!.srcPath, 'utf8');
    expect(patch).toContain('Store payment amounts as integer cents');
    expect(patch).not.toContain('README.md');
    expect(patch).not.toContain(repo);
    const theirs = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-'));
    git(theirs, 'clone', '-q', '-b', 'main', repo, '.');
    git(theirs, 'switch', '-qc', 'from-sam');
    git(theirs, 'am', '-q', got.file!.srcPath);
    expect(fs.readFileSync(path.join(theirs, 'src', 'payments.js'), 'utf8')).toContain('Math.round');
    expect(git(theirs, 'log', '--format=%s', '-2')).toContain('Test the cents store');
  });

  it('says in the brief what it is and to apply it on a branch first', () => {
    const got = handedChange({ repoPath: repo, id: ID, owner: 'Sam', outDir: out });
    expect(got.words).toContain(`[${ID}.patch](${got.file!.rel})`);
    expect(got.words).toContain('2 commits from Sam’s branch');
    expect(got.words).toMatch(/new branch first.*git am/);
  });

  it('is named in the brief, not sent, when it is too big', () => {
    const got = handedChange({ repoPath: repo, id: ID, owner: 'Sam', outDir: out, maxBytes: 100 });
    expect(got.file).toBeNull();
    expect(got.words).toMatch(/too big to send/);
    expect(got.words).toContain(`agentbox/${ID}`);
  });

  it('is nothing for a thread whose branch made no commits, or that has no branch, or no repository', () => {
    git(repo, 'branch', 'agentbox/w-empty', 'main');
    expect(handedChange({ repoPath: repo, id: 'w-empty', owner: 'Sam', outDir: out })).toEqual({ file: null, words: '' });
    expect(handedChange({ repoPath: repo, id: 'w-none', owner: 'Sam', outDir: out })).toEqual({ file: null, words: '' });
    expect(handedChange({ repoPath: null, id: ID, owner: 'Sam', outDir: out })).toEqual({ file: null, words: '' });
  });
});

describe('the hand-over', () => {
  const src = fs.readFileSync(new URL('../main/team/index.mts', import.meta.url), 'utf8');
  const handOn = src.slice(src.indexOf('async handOn('), src.indexOf('/** A task\'s words and files'));

  it('sends the patch with the task and its line in the brief', () => {
    expect(handOn).toMatch(/handedChange\(\{ repoPath: product\.repoPath/);
    expect(handOn).toMatch(/files: \[\.\.\.files, \.\.\.\(change\.file \? \[change\.file\] : \[\]\)\]/);
  });

  it('closes the thread before it waits on the cloud', () => {
    expect(handOn).toMatch(/\{ sync: false \}/);
    expect(handOn.indexOf("status: 'done'")).toBeLessThan(handOn.indexOf('await syncNow()'));
  });
});
