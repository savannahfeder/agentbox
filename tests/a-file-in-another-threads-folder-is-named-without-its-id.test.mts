// A step line read "Changed …/worktrees/w-86b35be5c7/README.md": a file in another thread's worktree
// kept the folder's internal id on screen (tester issue 23, its third sighting). Checked on shortPath.
import { describe, it, expect } from 'vitest';
import { shortPath } from '../shared/work-lines.mts';

const REPO = '/Users/you/dev/payments-api';
const MINE = `${REPO}/.claude/worktrees/w-1a2b3c4d5e`;
const OTHER = `${REPO}/.claude/worktrees/w-86b35be5c7`;

describe("a file in another thread's folder", () => {
  it('is named from inside that folder, the reported one', () => {
    expect(shortPath(`${OTHER}/README.md`, MINE, '/Users/you')).toBe('…/README.md');
  });
  it('keeps the end of a longer path inside it', () => {
    expect(shortPath(`${OTHER}/src/routes/payments/index.ts`, MINE, '/Users/you')).toBe('…/routes/payments/index.ts');
    expect(shortPath(`${OTHER}/src/app.ts`, MINE, '/Users/you')).toBe('…/src/app.ts');
  });
});

describe('what stays as it was', () => {
  it("a file in the thread's own folder", () => {
    expect(shortPath(`${MINE}/src/app.ts`, MINE, '/Users/you')).toBe('src/app.ts');
  });
  it('a folder called worktrees with no thread id in it', () => {
    expect(shortPath('/Users/you/worktrees/notes/a.md', MINE, '/Users/you')).toBe('~/worktrees/notes/a.md');
    expect(shortPath('/srv/git/worktrees/main/notes/a.md', MINE)).toBe('…/main/notes/a.md');
  });
  it("the other thread's folder itself", () => {
    expect(shortPath(OTHER, MINE, '/Users/you')).toBe('…/.claude/worktrees/w-86b35be5c7');
  });
});
