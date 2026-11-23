// A PLAN READS AS CLAUDE CODE NAMES IT.
//
// What broke (2026-11-20): Anthropic renamed the 20x Max plan Ultra. Claude
// Code writes that name into each login's profile as `planDisplayName` and
// shows "Claude Ultra" itself, while the rate limit tier still reads
// `default_claude_max_20x`. Agentbox built its label from the tier, so the
// Accounts page said "Max 20x" for a plan its owner knew as Ultra. Measured on
// Claude Code 2.1.325, whose own label is `Claude ${planDisplayName}`.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPlan } from '../main/claude-plan.mts';

let dir: string;
const write = (account: Record<string, unknown>) => {
  const file = path.join(dir, `${Math.random()}.json`);
  fs.writeFileSync(file, JSON.stringify({ oauthAccount: account }));
  return readPlan('x', { file });
};
const MAX_20 = { organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x', billingType: 'stripe_subscription' };

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-name-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('the plan\'s name', () => {
  it('the reported case: the tier says Max 20x and Claude Code says Ultra', () => {
    expect(write({ ...MAX_20, planDisplayName: 'Ultra' })).toMatchObject({ label: 'Ultra', max: true });
  });

  it('with no name written, it reads from the tier as before', () => {
    expect(write(MAX_20).label).toBe('Max 20x');
  });

  it('an empty or odd name is not shown', () => {
    expect(write({ ...MAX_20, planDisplayName: '' }).label).toBe('Max 20x');
    expect(write({ ...MAX_20, planDisplayName: 42 }).label).toBe('Max 20x');
    expect(write({ ...MAX_20, planDisplayName: 'x'.repeat(200) }).label).toBe('Max 20x');
  });

  it('must NOT hide an ended subscription behind its old name', () => {
    expect(write({ ...MAX_20, planDisplayName: 'Ultra', billingType: 'none' })).toMatchObject({ label: 'Subscription ended', ended: true });
  });

  it('a name with no tier still says nothing, as an unreadable login always has', () => {
    expect(write({ planDisplayName: 'Ultra' }).known).toBe(false);
  });
});
