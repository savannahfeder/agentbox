// A PLAN IS CALLED WHAT CLAUDE CALLS IT.
//
// What broke (2026-11-20): every Max login on the Claude Code settings page
// read "Max 20x" after Anthropic renamed the plan. Claude Code 2.1.330 saves
// the plan's name in `oauthAccount.planDisplayName` ("Ultra") and keeps the
// old rate limit tier, `default_claude_max_20x`, beside it; the label was built
// from the tier. Measured on one Mac's three logins: all three files said
// "Ultra" next to the old tier string, and the page said "Max 20x" on each.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPlan } from '../main/claude-plan.mts';

const login = (oauthAccount: Record<string, unknown>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-plan-name-'));
  const file = path.join(dir, '.claude.json');
  fs.writeFileSync(file, JSON.stringify({ oauthAccount }));
  return file;
};
const max20 = { billingType: 'stripe_subscription', organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x' };

describe('the plan line on an account', () => {
  it('uses the name Claude Code saved, not the old tier string', () => {
    const plan = readPlan('x', { file: login({ ...max20, planDisplayName: 'Ultra' }) });
    expect(plan.label).toBe('Ultra');
    expect(plan.max).toBe(true);
    expect(plan.tier).toBe('default_claude_max_20x');
  });

  it('falls back to the tier on a file that saved no name', () => {
    expect(readPlan('x', { file: login(max20) }).label).toBe('Max 20x');
  });

  it('falls back to the tier when the saved name is blank or not text', () => {
    expect(readPlan('x', { file: login({ ...max20, planDisplayName: '  ' }) }).label).toBe('Max 20x');
    expect(readPlan('x', { file: login({ ...max20, planDisplayName: 7 }) }).label).toBe('Max 20x');
  });

  it('still says the subscription ended on a login with no billing, whatever name it kept', () => {
    const plan = readPlan('x', { file: login({ ...max20, billingType: 'none', planDisplayName: 'Ultra' }) });
    expect(plan.ended).toBe(true);
    expect(plan.label).toBe('Subscription ended');
  });
});
