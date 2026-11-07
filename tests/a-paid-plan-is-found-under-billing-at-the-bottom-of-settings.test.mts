// A PAID PLAN IS FOUND UNDER BILLING, AT THE BOTTOM OF SETTINGS.
//
// What broke (2026-10-25): "imagine you have paid for your plan ... I need to
// figure out where I paid for that and how to manage that. You go into
// settings and cannot find it. Cloud is completely hidden. I would not equate
// cloud to billing." The plan and its billing were a page called Cloud in the
// middle of the Agents group. Of five drawn options the founder chose a
// Billing group last in the list, its page "Plan and Billing" (capital B, her
// word): the plan with Manage billing, this month's agents and hours as two
// meters, then the plans to change to.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_PAGES, searchSettings } from '../renderer/src/settings-search';
import { planSummary } from '../renderer/src/cloud-upgrade';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const settings = fs.readFileSync(path.join(root, 'renderer/src/components/Settings.tsx'), 'utf8');

describe('where the plan is in Settings', () => {
  it('is "Plan and Billing", the one page of a Billing group', () => {
    expect(SETTINGS_PAGES.filter((p) => p.group === 'Billing')).toEqual([{ id: 'cloud', label: 'Plan and Billing', group: 'Billing' }]);
  });

  it('is the last group in the list, after Workspace', () => {
    expect(settings).toContain("(['Personal', 'Agents', 'Workspace', 'Billing'] as const)");
    expect(SETTINGS_PAGES.at(-1)?.group).toBe('Billing');
  });

  it('is no longer among the agents', () => {
    expect(SETTINGS_PAGES.filter((p) => p.group === 'Agents').map((p) => p.id)).not.toContain('cloud');
  });

  it('is what a search for billing words lands on', () => {
    const pages = SETTINGS_PAGES.map((p) => p.id);
    for (const q of ['billing', 'invoices', 'cancel plan', 'payment', 'subscription', 'manage plan']) {
      expect(searchSettings(q, { pages }).map((h) => h.page), q).toContain('cloud');
    }
  });
});

describe('what the page says about the plan', () => {
  const max = { signedIn: true, plan: 'max', unlimited: true, agents: null, hoursPerMonth: 3000, running: 3, usedSeconds: 86 * 3600 + 1200, billing: 'stripe' };
  const pro = { signedIn: true, plan: 'pro', unlimited: false, agents: 10, hoursPerMonth: 400, running: 4, usedSeconds: 100 * 3600, billing: 'stripe' };

  it('a plan Stripe bills: its name, price, Manage billing, and the month as two meters', () => {
    expect(planSummary(max)).toEqual({
      name: 'Agentbox Cloud Max', price: '$200 a month', who: 'Billed monthly by Stripe', manage: true,
      agents: { line: '3 running, no limit', percent: 0 },
      hours: { line: '86 of 3,000 hours', percent: 3 },
    });
    expect(planSummary(pro)).toMatchObject({ agents: { line: '4 of 10 running', percent: 40 }, hours: { line: '100 of 400 hours', percent: 25 } });
  });

  it('a plan set by hand says so, with nothing to manage on Stripe', () => {
    expect(planSummary({ ...max, billing: 'given' })).toMatchObject({ who: 'Set up for you, nothing to pay', manage: false });
  });

  it('no plan has no summary, and the page shows only the plans', () => {
    expect(planSummary({ signedIn: true, plan: 'none', agents: 0 })).toBeNull();
    expect(planSummary(null)).toBeNull();
  });

  it('a meter never runs past full', () => {
    expect(planSummary({ ...pro, usedSeconds: 900 * 3600, running: 12 })).toMatchObject({ agents: { percent: 100 }, hours: { percent: 100 } });
  });
});
