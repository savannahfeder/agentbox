// A SUBSCRIPTION CLAUDE WILL NOT USE STAYS ENDED ON ITS CARD.
//
// What broke (2026-11-20): a personal Max subscription ended and the Claude
// Code settings page went on showing it as healthy: "Max 20x" and a week bar
// at 31%, so the person took the dead runs for a fault in Agentbox. Measured on
// that login the same day:
//
// - `claude -p` was refused with "Claude Code can't use your Claude
//   subscription, usually because a payment is past due · Pay or renew at
//   https://claude.ai/settings/billing ...". No rule knew those words, so the
//   run was filed as 'unknown'.
// - Its `.claude.json` still said billingType "stripe_subscription", plan
//   "Ultra", fetched that morning, and the refused run did not refetch it. So
//   the file alone could not say the subscription had ended.
// - Claude Code's own usage report on that login still came back: subscription
//   "max", seven_day utilization 31. A usage reading was taken as proof the
//   account runs and cleared the mark.
//
// Now the refusal reads as an ended subscription, the card says so, and only a
// change in the login's plan fields (a renewal) or a run that works lets it go.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { troubleCause, refineCause, runStoppedLine } from '../shared/spawn-trouble.mts';
import { Supervisor } from '../main/supervisor.mts';
import { readSettings } from '../main/settings.mts';
import { forgetDiscovery } from '../main/account-discovery.mts';

const PAST_DUE = "Claude Code can't use your Claude subscription, usually because a payment is past due · Pay or renew at https://claude.ai/settings/billing (if you just paid, try again shortly), or use an Anthropic API key instead";
const paying = {
  emailAddress: 'you@example.com', accountUuid: 'acct-1', billingType: 'stripe_subscription',
  organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x', planDisplayName: 'Ultra',
  subscriptionCreatedAt: '2024-06-24T00:00:00Z',
};

const setUp = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-past-due-'));
  const file = path.join(home, '.claude.json');
  fs.writeFileSync(file, JSON.stringify({ oauthAccount: paying }));
  forgetDiscovery();
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  const config = {
    home, storeRoot: home, accountRoot: home, appDir: home,
    claudeBin: '/nonexistent/claude', maxConcurrentSessions: 3, authProfiles: ['default'], sessionArgs: [],
  };
  const sup = new Supervisor(config, store, home);
  const die = (words: string) => sup.noteExitForBackoff({
    itemId: 'w-test', product: 'agentbox', profile: 'default',
    startedAt: Date.now() - 2_000, tail: [`stderr: ${words}`, 'session exited (1)'],
  });
  // The plan is cached on the file's mtime and size; a real rewrite is minutes later.
  let tick = 1;
  const rewrite = (oauthAccount: Record<string, unknown>) => {
    fs.writeFileSync(file, JSON.stringify({ oauthAccount }));
    const later = new Date(Date.now() + 1_000 * tick++);
    fs.utimesSync(file, later, later);
  };
  const card = () => readSettings({ config, supervisor: sup, store }).workspace.accounts[0];
  const reading = (percent: number) => ({ at: Date.now() + 5_000, limits: [{ span: 'week', name: 'This week', percent }] });
  return { sup, die, rewrite, card, reading };
};

describe('the words Claude Code refuses an unpaid subscription with', () => {
  it('read as an ended subscription', () => {
    expect(troubleCause(PAST_DUE)).toBe('subscription-ended');
    expect(troubleCause(PAST_DUE.replace("can't", 'can’t'))).toBe('subscription-ended');
  });

  it('say so on the thread the run stopped in', () => {
    expect(runStoppedLine(PAST_DUE)).toBe("This run stopped because that account's Claude subscription has ended.");
  });

  it('do not take in a signed-out login or a limit', () => {
    expect(troubleCause('Not logged in · Please run /login')).toBe('signed-out');
    expect(troubleCause("You've hit your session limit · resets 5:09pm")).toBe('at-limit');
    expect(troubleCause('Your organization has disabled Claude subscription access for Claude Code')).toBe('org-blocked');
  });

  it('a cause nobody could name, on a login whose file says it has no billing, is the ended subscription', () => {
    expect(refineCause('unknown', { ended: true })).toBe('subscription-ended');
    expect(refineCause('unknown', { ended: false })).toBe('unknown');
    expect(refineCause('unknown', null)).toBe('unknown');
  });
});

describe('the card of a login refused for its subscription', () => {
  it('says the subscription ended, in its sentence and on its plan line', () => {
    const { die, card } = setUp();
    die(PAST_DUE);
    const row = card();
    expect(row.trouble?.cause).toBe('subscription-ended');
    expect(row.trouble?.note).toMatch(/subscription has ended/i);
    expect(row.plan?.label).toBe('Subscription ended');
  });

  it('keeps the plan Claude Code named while nothing is wrong', () => {
    const { card } = setUp();
    expect(card().plan?.label).toBe('Ultra');
  });

  it('is not cleared by a usage reading, which an unpaid subscription still gets', () => {
    const { sup, die, reading } = setUp();
    die(PAST_DUE);
    sup.noteUsageReading('default', reading(31));
    expect(sup._profileTrouble.default?.cause).toBe('subscription-ended');
  });

  it('a usage reading still clears a signed-out login', () => {
    const { sup, die, reading } = setUp();
    die('Not logged in · Please run /login');
    expect(sup._profileTrouble.default?.cause).toBe('signed-out');
    sup.noteUsageReading('default', reading(31));
    expect(sup._profileTrouble.default).toBeUndefined();
  });

  it('is not cleared by a login file that still says it pays, as it did before the refusal', () => {
    const { sup, die, rewrite } = setUp();
    die(PAST_DUE);
    sup._forgetRenewedSubscriptions();
    expect(sup._profileTrouble.default?.cause).toBe('subscription-ended');
    // Claude Code rewrites the file all day; the plan fields are unchanged.
    rewrite({ ...paying, lastSeen: 'later' });
    sup._forgetRenewedSubscriptions();
    expect(sup._profileTrouble.default?.cause).toBe('subscription-ended');
  });

  // A renewal measured the same evening changed nothing in the login's file,
  // so a person picking the account is the sign. Still unpaid, its first run
  // is refused in seconds and the mark is back.
  it('is let go when the person picks the account in Settings', () => {
    const { sup, die } = setUp();
    die(PAST_DUE);
    sup.accountChosen('claude', 'default');
    expect(sup._profileTrouble.default).toBeUndefined();
    die(PAST_DUE);
    expect(sup._profileTrouble.default?.cause).toBe('subscription-ended');
  });

  it('picking a signed-out account does not call it signed in', () => {
    const { sup, die } = setUp();
    die('Not logged in · Please run /login');
    sup.accountChosen('claude', 'default');
    expect(sup._profileTrouble.default?.cause).toBe('signed-out');
  });

  it('is let go when the login\'s plan changes, as a renewal changes it', () => {
    const { sup, die, rewrite } = setUp();
    die(PAST_DUE);
    rewrite({ ...paying, subscriptionCreatedAt: '2026-11-21T00:00:00Z' });
    sup._forgetRenewedSubscriptions();
    expect(sup._profileTrouble.default).toBeUndefined();
  });
});
