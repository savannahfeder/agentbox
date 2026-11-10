// SHIPPING IS ONE COMMAND, SO THAT EVERY AGENT DOES THE SAME THING.
//
// WHY, 2026-10-01. Several agents work this repository at once and each one
// shipped by hand, in its own order: one pushed, had main move underneath it and
// retried; one merged into the app folder instead of pushing, which left a
// commit nowhere but that folder; one pushed work that the public check refused
// and had to unpick it afterwards. Same repository, three procedures, and the
// differences only showed as breakage.
//
// So: `npm run ship`. Fetch, merge what moved, run the tests for what changed,
// push, and when the push is rejected because main moved while the tests ran,
// do the whole lot again rather than leaving a half-shipped branch behind.
//
// What is pinned here is the part that has to be right every time and is easy
// to get subtly wrong: which push failures are worth retrying (a race) and which
// are not (a refusal), and that the script cannot quietly skip the gates.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { racedWithAnotherPush, notReadyToShip } from '../scripts/lib/ship-rules.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe('a push that lost a race is worth doing again', () => {
  it('knows the three ways git says somebody else pushed first', () => {
    expect(racedWithAnotherPush("! [remote rejected] HEAD -> main (cannot lock ref 'refs/heads/main': is at 2af5296 but expected 5ec422d)")).toBe(true);
    expect(racedWithAnotherPush('! [rejected] HEAD -> main (non-fast-forward)')).toBe(true);
    expect(racedWithAnotherPush('! [rejected] HEAD -> main (fetch first)')).toBe(true);
    expect(racedWithAnotherPush('hint: Updates were rejected because the remote contains work that you do not have locally.')).toBe(true);
  });

  it('does not retry a refusal, which would just fail again more slowly', () => {
    // The gates. Pushing these again changes nothing: they need a person.
    expect(racedWithAnotherPush('check-before-public: PUSH REFUSED. 11 thing(s) should not go to a public repository')).toBe(false);
    expect(racedWithAnotherPush('pre-push: 3 tests failed, so nothing was pushed.')).toBe(false);
    expect(racedWithAnotherPush('remote: Permission to savannahfeder/agentbox.git denied')).toBe(false);
    expect(racedWithAnotherPush('fatal: could not read Username for https://github.com: terminal prompts disabled')).toBe(false);
    expect(racedWithAnotherPush('')).toBe(false);
  });
});

describe('what has to be true before anything is pushed', () => {
  it('refuses to ship from the folder the app runs out of, which only ever follows main', () => {
    const why = notReadyToShip({ isPrimaryWorktree: true, dirty: false, onMain: false, hasCommits: true });
    expect(why).toMatch(/worktree/i);
  });

  it('refuses a tree with uncommitted work, so what is tested is what is pushed', () => {
    expect(notReadyToShip({ isPrimaryWorktree: false, dirty: true, onMain: false, hasCommits: true })).toMatch(/uncommitted/i);
  });

  it('refuses a branch standing on main, because main is what it is shipping to', () => {
    expect(notReadyToShip({ isPrimaryWorktree: false, dirty: false, onMain: true, hasCommits: true })).toMatch(/\bmain\b/);
  });

  it('says so when there is nothing to ship, rather than pushing nothing', () => {
    expect(notReadyToShip({ isPrimaryWorktree: false, dirty: false, onMain: false, hasCommits: false })).toMatch(/nothing/i);
  });

  it('is happy with a clean branch in a worktree that has commits', () => {
    expect(notReadyToShip({ isPrimaryWorktree: false, dirty: false, onMain: false, hasCommits: true })).toBe(null);
  });
});

describe('the command itself', () => {
  const ship = fs.readFileSync(path.join(REPO, 'scripts/ship.mjs'), 'utf8');

  it('is what npm run ship runs', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    expect(pkg.scripts.ship).toContain('scripts/ship.mjs');
  });

  it('pushes to the public main and nowhere else', () => {
    expect(ship).toContain('HEAD:main');
  });

  it('never skips the hook, which is where the tests and the public check live', () => {
    expect(ship).not.toContain('--no-verify');
  });

  it('leaves the app folder to fast-forward itself, rather than reaching into it', () => {
    // A script that writes into another checkout is how that folder ended up
    // ahead of the public repository in the first place.
    expect(ship).not.toMatch(/git[^\n]*-C[^\n]*merge/);
  });
});
