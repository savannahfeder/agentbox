// The founder found the agent skills listed on the public GitHub repository and
// asked for them to be private (2026-11-16). An audit found the plans worse: the
// cloud plan's reading of Anthropic's and OpenAI's terms, the cost of a seat,
// and the phone plan's App Store strategy. All of it moved to a private
// repository checked out at `.claude/skills`, with the skills' own tests. This
// holds the public side: nothing of it tracked, the push check refusing it,
// and the suite still running its tests on a computer that has the folder.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkPath } from '../scripts/check-before-public.mjs';
import { SUITE_INCLUDE } from '../vitest.config.mjs';

const root = path.resolve(import.meta.dirname, '..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const PLANS = ['docs/cloud/PLAN.md', 'docs/cloud/PHONE-PLAN.md', 'docs/mobile/PLAN.md', 'docs/team/PLAN.md', 'docs/team/ROOMS-PLAN.md', 'docs/team/connections-plan.md'];

describe('the public repository', () => {
  it('tracks no skill', () => {
    expect(git('ls-files', '.claude/skills')).toBe('');
  });

  it('tracks none of the plans', () => {
    expect(git('ls-files', ...PLANS)).toBe('');
  });

  it('ignores the private checkout, so nothing in it is committed by accident', () => {
    expect(git('check-ignore', '.claude/skills/unslop/SKILL.md')).toBe('.claude/skills/unslop/SKILL.md');
  });

  it('names where the private checkout comes from', () => {
    const named = JSON.parse(fs.readFileSync(path.join(root, '.agentbox/private.json'), 'utf8'));
    expect(named).toEqual({ path: '.claude/skills', url: 'https://github.com/savannahfeder/agentbox-private.git' });
  });

  it('points agents at the private notes, which a missing file leaves out', () => {
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toMatch(/^@\.claude\/skills\/CLAUDE\.md$/m);
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('.claude/skills/CLAUDE.md');
  });

  it('keeps the tester rules in the private notes, not the public ones', () => {
    const rules = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    expect(rules).not.toMatch(/Codex plan for testing|login with the best plan|SYNTHETIC USERS/);
  });
});

describe('the push check', () => {
  it('refuses a skill or anything else under the private checkout', () => {
    expect(checkPath('.claude/skills/power-test/SKILL.md')).not.toEqual([]);
    expect(checkPath('.claude/skills/tests/x.test.mts')).not.toEqual([]);
  });

  it('refuses every plan', () => {
    for (const plan of PLANS) expect(checkPath(plan), plan).not.toEqual([]);
  });

  it('lets through the public docs and the project\'s own Claude Code settings', () => {
    for (const ok of ['docs/harnesses.md', 'docs/security-checks.md', 'docs/readme/inbox.webp', '.claude/settings.json', 'scripts/iphone-host.mjs']) {
      expect(checkPath(ok), ok).toEqual([]);
    }
  });
});

describe('the suite', () => {
  it('runs the private tests when the private checkout is there', () => {
    expect(SUITE_INCLUDE).toContain('.claude/skills/tests/**/*.test.mts');
  });
});
