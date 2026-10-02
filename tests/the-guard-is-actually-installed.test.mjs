// THE GUARD IS ONLY A GUARD IF IT IS ON DISK, 2026-09-01.
//
// tests/her-checkout-stays-on-main.test.mjs proves the hooks WORK, in a throwaway
// repo it builds itself. It never asks whether they are installed in the checkout
// they are supposed to be guarding, and that is the hole this file closes.
//
// WHAT HAPPENED. The hooks landed on 2026-09-01 in `ce82547`, "Nothing commits in
// her checkout either". Some hours later all three were deleted out of the working
// tree of ~/Desktop/dev/zero and staged for deletion. `core.hooksPath` still
// pointed at `scripts/hooks`, so everything LOOKED enforced.
//
// GIT DOES NOT COMPLAIN ABOUT A MISSING HOOK. A hook that is not there is simply
// not run: no warning, no exit code, nothing in any log. So the guard was off for
// hours, six commits went straight onto main in her checkout, and the first anyone
// knew of it was a merge being refused.
//
// She is right, and a rule that can be switched off silently is not two states,
// it is three.
//
// SO THIS TEST ASKS THE REAL REPOSITORY. It is deliberately not hermetic. If a
// hook is deleted, unreadable or not executable, the suite goes red on the next
// run anybody does, anywhere, instead of nothing happening at all.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The hooks the guards are built from. `reference-transaction` joined them on
 * 2026-10-02: the other three guard commits, and a fast-forward is not a commit,
 * so local main could still be moved onto work no push had carried.
 * `pre-push` is not one of them; it is an older, separate thing and this file
 * does not speak for it. */
const REQUIRED = ['pre-commit', 'post-checkout', 'pre-merge-commit', 'reference-transaction'];

const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

describe('the checkout guard is installed, not merely written', () => {
  it('git is pointed at our hooks directory', () => {
    // Without this, every file below is inert no matter how correct it is.
    let configured = '';
    try { configured = git('config', 'core.hooksPath'); } catch { configured = ''; }
    expect(configured, 'core.hooksPath is unset, so none of the hooks run').toBe('scripts/hooks');
  });

  it('every hook the guard needs is on disk', () => {
    const missing = REQUIRED.filter((h) => !fs.existsSync(path.join(root, 'scripts/hooks', h)));
    expect(missing, `these hooks are gone, so the guard is off: ${missing.join(', ')}`).toEqual([]);
  });

  it('and every one of them is executable, because git skips one that is not', () => {
    // A hook without the execute bit is exactly as dead as a hook that is absent,
    // and just as quiet about it.
    const notExec = REQUIRED.filter((h) => {
      const at = path.join(root, 'scripts/hooks', h);
      if (!fs.existsSync(at)) return false;
      return (fs.statSync(at).mode & 0o111) === 0;
    });
    expect(notExec, `not executable, so git will skip them: ${notExec.join(', ')}`).toEqual([]);
  });

  it('the merge hook still delegates, so a merge cannot walk past the commit block', () => {
    // Git runs pre-commit for a commit and pre-merge-commit for a merge. If this
    // stops pointing at the other one, folding main into a branch in her checkout
    // goes straight through.
    const merge = fs.readFileSync(path.join(root, 'scripts/hooks/pre-merge-commit'), 'utf8');
    expect(merge).toContain('pre-commit');
  });
});
