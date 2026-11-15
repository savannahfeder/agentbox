// AN IPHONE BUILD LEAVES OTHER TASK FOLDERS BEHIND.
//
// What broke (w-a68a52a026, 2026-11-07): `eas build` in mobile/ failed with
// "ENOENT: no such file or directory, lstat '…/.claude/worktrees/w-4e7040617c'".
// eas-cli copies the whole repository and skips only what the .gitignore files
// list (vcs/local.js makeShallowCopyAsync; .git/info/exclude is not read), and
// the task folders under .claude/worktrees were not listed. So every other
// task's checkout went into the upload, and a task that closed mid-copy took
// its folder away under it. Reproduced with eas-cli's own copy step on a clone
// with stand-in task folders deleted during the copy; with this line the copy
// leaves them out.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const ignored = (p) => {
  try { execFileSync('git', ['check-ignore', '--no-index', '-q', p], { cwd: root }); return true; } catch { return false; }
};

describe('what the iPhone build copies', () => {
  it('leaves out every task folder and what is in it', () => {
    expect(ignored('.claude/worktrees/w-4e7040617c')).toBe(true);
    expect(ignored('.claude/worktrees/w-4e7040617c/mobile/app.config.ts')).toBe(true);
  });

  it('still takes the phone app, the shared code it imports, and the skills', () => {
    expect(ignored('mobile/app.config.ts')).toBe(false);
    expect(ignored('shared/product-name.mjs')).toBe(false);
    expect(ignored('.claude/skills/power-test/SKILL.md')).toBe(false);
  });
});
