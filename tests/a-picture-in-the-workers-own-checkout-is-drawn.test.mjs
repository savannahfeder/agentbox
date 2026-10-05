// A PICTURE A WORKER SAVED IN ITS OWN CODE CHECKOUT IS DRAWN, AND OPENS.
//
// Her screenshot, 2026-10-04 evening, after the first round of this fix: a
// result naming seven pictures as `designs/w-1b574413db/a1-page-empty.png` and
// the like, every one drawn as "missing image". The files were on disk, at
//
//   <repo>/.claude/worktrees/w-1b574413db/designs/w-1b574413db/a1-page-empty.png
//
// Every worker now runs in a checkout of its own under the repository's
// `.claude/worktrees/<task id>` (main/task-folders.mjs), so a path it writes is
// relative to THAT folder. The window never looked there, and main's own hunt
// by name skips every folder whose name starts with a dot, `.claude` included,
// so a click could not find it either.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pictureRoots } from '../renderer/src/message-folders.ts';
import { resolveArtifact } from '../main/artifact-path.mjs';

const DIR = '/Users/you/Zero/accounts/acct/agentbox-team';
const REPO = '/Users/you/dev/agentbox';

describe('where the window looks for a picture', () => {
  it("looks in the thread's own checkout, where the worker saved it", () => {
    const roots = pictureRoots({ dir: DIR, repo: REPO, id: 'w-1b574413db', texts: ['`designs/w-1b574413db/a1-page-empty.png`'] });
    expect(roots).toContain(`${REPO}/.claude/worktrees/w-1b574413db`);
  });

  it('tries it before the five folders it always tried', () => {
    const roots = pictureRoots({ dir: DIR, repo: REPO, id: 'w-1b', texts: [] });
    const at = roots.indexOf(`${REPO}/.claude/worktrees/w-1b`);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(roots.indexOf(DIR));
  });

  it('has no checkout to look in when the project has no code folder', () => {
    const roots = pictureRoots({ dir: DIR, repo: null, id: 'w-1b', texts: [] });
    expect(roots.some((r) => r.includes('.claude'))).toBe(false);
  });
});

describe('what a click on it opens', () => {
  let root, dir, repo, products;
  const put = (rel) => {
    const file = path.join(repo, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x');
    return file;
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'checkout-pictures-'));
    dir = path.join(root, 'store', 'agentbox-team');
    repo = path.join(root, 'repo');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(repo, { recursive: true });
    products = [{ slug: 'agentbox-team', dir, repoPath: repo }];
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const open = (src) => resolveArtifact({ src, product: 'agentbox-team', products, accountRoot: path.join(root, 'store') });

  it('finds the picture in the checkout its path names, as on her screenshot', () => {
    const file = put('.claude/worktrees/w-1b574413db/designs/w-1b574413db/a1-page-empty.png');
    expect(open('designs/w-1b574413db/a1-page-empty.png')).toEqual({ ok: true, path: file });
  });

  it('still prefers the same path in the project folder when it is there', () => {
    put('.claude/worktrees/w-1b/designs/w-1b/a.png');
    const own = path.join(dir, 'designs', 'w-1b', 'a.png');
    fs.mkdirSync(path.dirname(own), { recursive: true });
    fs.writeFileSync(own, 'x');
    expect(open('designs/w-1b/a.png').path).toBe(own);
  });

  it('does NOT reach into another task\'s checkout for a path that names no task', () => {
    put('.claude/worktrees/w-1b/shots/a.png');
    expect(open('shots/a.png').ok).toBe(false);
  });

  it('does NOT invent a checkout that is not there', () => {
    expect(open('designs/w-0000000000/a.png').ok).toBe(false);
  });
});
