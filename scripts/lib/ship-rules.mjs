// THE TWO JUDGEMENTS SHIPPING HAS TO MAKE, kept pure so they can be tested
// without pushing anything (tests/one-ship-command-every-agent-runs.test.mjs).

/**
 * Did this push fail because somebody else pushed first?
 *
 * That is a race, and the answer is to fetch, merge, test and push again. Every
 * other failure is a refusal (the tests, the public check, credentials), and
 * pushing it again changes nothing except how long it takes to find out.
 */
export function racedWithAnotherPush(stderr) {
  const s = String(stderr ?? '').toLowerCase();
  if (!s) return false;
  return /cannot lock ref/.test(s)
    || /non-fast-forward/.test(s)
    || /fetch first/.test(s)
    || /stale info/.test(s)
    || /remote contains work that you do not have/.test(s);
}

/**
 * Why this branch cannot be shipped yet, as a sentence, or null when it can.
 *
 * The app folder is the primary worktree, and it only ever follows the public
 * main; shipping from it is what left an unshipped commit sitting in it.
 */
export function notReadyToShip({ isPrimaryWorktree, dirty, onMain, hasCommits }) {
  if (isPrimaryWorktree) {
    return 'This is the folder the app runs from, which only ever follows the public main. Ship from the worktree your work is in.';
  }
  if (dirty) {
    return 'There is uncommitted work here. Commit it first, so what the tests run on is what gets pushed.';
  }
  if (onMain) {
    return 'This branch is main, which is what it would be shipping to. Work on agentbox/<item id>.';
  }
  if (!hasCommits) {
    return 'There is nothing to ship: this branch has no commits that origin/main does not already have.';
  }
  return null;
}
