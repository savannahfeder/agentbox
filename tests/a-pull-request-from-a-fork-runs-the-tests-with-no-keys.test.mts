// A PULL REQUEST FROM A FORK RUNS THE TESTS, AND RUNS THEM WITH NO KEYS.
//
// w-bde446f1aa, 2026-10-07. The workflow ran on `push` only, and a push to a
// fork happens in the fork, so not one of the outside pull requests open that
// day (#13, #15, #22) had a test run on this repository. `pull_request` from a
// fork runs with a read-only token and no secrets, which is what makes it safe
// to run a stranger's code there; `pull_request_target` runs with the
// repository's own token and is the classic way a stranger takes one over, so
// it must never appear.
//
// Also pinned: Dependabot opens the tiptap packages as one pull request,
// because they only work at matching versions, and five of the eight open
// that day were separate bumps of packages that must move together.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/tests.yml', 'utf8');
const dependabot = fs.readFileSync('.github/dependabot.yml', 'utf8');
const code = workflow.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

describe('the tests workflow', () => {
  it('runs on pull requests', () => {
    expect(code).toMatch(/^on:[\s\S]*^\s{2}pull_request:/m);
  });

  it('still runs on every push', () => {
    expect(code).toMatch(/^\s{2}push:\n\s{4}branches: \['\*\*'\]/m);
  });

  // A branch of this repository is already run by its push; only a fork's
  // pull request needs the second trigger, so one commit is never paid twice.
  it('runs the pull request trigger only for forks', () => {
    expect(code).toContain("if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name != github.repository");
  });

  it('gives the job a read-only token', () => {
    expect(code).toMatch(/^permissions:\n\s{2}contents: read$/m);
    expect(code).not.toMatch(/contents: write|pull-requests: write|id-token: write/);
  });

  it('never uses the trigger that hands a fork the repository\'s keys', () => {
    expect(code).not.toContain('pull_request_target');
    expect(code).not.toContain('secrets.');
  });
});

describe('dependency updates', () => {
  it('opens the tiptap packages as one pull request', () => {
    expect(dependabot).toMatch(/groups:\n\s+tiptap:\n\s+patterns:\n\s+- "@tiptap\/\*"/);
  });
});
