// PRs from forks retain read-only validation; feature pushes must not duplicate
// the Linux, macOS, or build jobs already run for the PR.
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
import { load } from 'js-yaml';

const workflow = fs.readFileSync('.github/workflows/tests.yml', 'utf8');
const config = load(workflow);
const dependabot = fs.readFileSync('.github/dependabot.yml', 'utf8');
const code = workflow.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

describe('the tests workflow', () => {
  it('runs on pull requests', () => {
    expect(code).toMatch(/^on:[\s\S]*^\s{2}pull_request:/m);
  });

  it('runs pushes to main and pull requests without duplicating feature-branch jobs', () => {
    expect(config.on.push.branches).toEqual(['main']);
    expect(config.on).toHaveProperty('pull_request');
    expect(config.on).toHaveProperty('workflow_dispatch');
    for (const job of Object.values(config.jobs)) expect(job.if).toBeUndefined();
  });

  it('provides zsh for the real shell-profile integration test on Linux', () => {
    const commands = config.jobs['vitest-linux'].steps.map(step => step.run || '').join('\n');
    expect(commands).toMatch(/apt-get install[^\n]*\bzsh\b/);
    expect(config.jobs.vitest.steps.map(step => step.run || '').join('\n')).not.toMatch(/apt-get/);
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
