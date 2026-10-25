// AN ACCOUNT WHOSE SUBSCRIPTION ENDED IS NOT AN ACCOUNT AN ADMIN SWITCHED OFF.
//
// Reported 2026-10-11: a personal Max account's subscription lapsed. Claude
// Code 2.1.293 refuses it with the very line an admin's policy prints,
//
//   Your organization has disabled Claude subscription access for Claude Code ·
//   Use an Anthropic API key instead, or ask your admin to enable access
//
// so the app said "its organization has turned Claude Code off. Only an admin
// of that workspace can turn it back on" about an account with no admin but its
// owner, the Accounts page still said "Max 20x", and the usage box said "Try
// again". Measured on that login's own ~/.claude.json the same evening:
// `oauthAccount.billingType` was "none" (a paying login says
// "stripe_subscription"), while `organizationRateLimitTier` still said
// `default_claude_max_20x` from before.
//
// So a refusal on a login whose file says it has no billing is filed as
// 'subscription-ended', the plan line says the subscription ended, and a login
// that does pay keeps the admin wording.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  troubleCause, refineCause, needsHerHands, troubleSentence, troubleRemedy, accountSentence,
  deadRunSentence, deadRunCause, runStoppedLine, causeWord, causeWhat, causeNext, causeAct, causeBreakdown,
} from '../shared/spawn-trouble.mjs';
import { readPlan, slotsForPlans } from '../main/claude-plan.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const REFUSAL = 'Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access';

const writeLogin = (oauthAccount) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-ended-'));
  const file = path.join(dir, '.claude.json');
  fs.writeFileSync(file, JSON.stringify({ oauthAccount }));
  return file;
};
const lapsed = { billingType: 'none', organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x' };
const paying = { billingType: 'stripe_subscription', organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x' };

describe('the plan line', () => {
  it('says the subscription ended when the login has no billing, whatever tier it still names', () => {
    const plan = readPlan('x', { file: writeLogin(lapsed) });
    expect(plan.ended).toBe(true);
    expect(plan.label).toBe('Subscription ended');
    expect(plan.label).not.toMatch(/max/i);
  });

  it('keeps Max 20x on a login that pays', () => {
    const plan = readPlan('x', { file: writeLogin(paying) });
    expect(plan.ended).toBe(false);
    expect(plan.label).toBe('Max 20x');
  });

  it('keeps the tier on a login whose file names no billing at all, as older files do', () => {
    const { billingType, ...old } = paying;
    const plan = readPlan('x', { file: writeLogin(old) });
    expect(plan.ended).toBe(false);
    expect(plan.label).toBe('Max 20x');
  });

  it('does not let an ended account drop everybody else to one agent at a time', () => {
    const max = readPlan('a', { file: writeLogin(paying) });
    const ended = readPlan('b', { file: writeLogin(lapsed) });
    expect(slotsForPlans([max, ended], 3)).toBe(3);
  });
});

describe('the reason a refused run is filed under', () => {
  it('is subscription-ended when the login has no billing', () => {
    expect(refineCause(troubleCause(REFUSAL), { ended: true })).toBe('subscription-ended');
  });

  it('stays org-blocked when the login pays, or its plan cannot be read', () => {
    expect(refineCause(troubleCause(REFUSAL), { ended: false })).toBe('org-blocked');
    expect(refineCause(troubleCause(REFUSAL), null)).toBe('org-blocked');
  });

  it('leaves every other reason alone, even on an ended login', () => {
    expect(refineCause('signed-out', { ended: true })).toBe('signed-out');
    expect(refineCause('at-limit', { ended: true })).toBe('at-limit');
  });
});

describe('what they are told', () => {
  const said = () => [
    troubleSentence('subscription-ended'),
    troubleRemedy('subscription-ended'),
    accountSentence('subscription-ended', null),
    causeNext('subscription-ended'),
    causeWhat('subscription-ended', 2),
    deadRunSentence({ engineWord: 'Claude Code', cause: 'subscription-ended' }),
  ];

  it('says the subscription ended, and never blames an admin or an organization', () => {
    for (const s of said()) {
      expect(s).not.toMatch(/admin|organi[sz]ation/i);
      expect(s).not.toMatch(/api key/i);
      expect(s).not.toMatch(/\/login/i);
    }
    expect(accountSentence('subscription-ended', null)).toMatch(/subscription has ended/i);
    expect(troubleRemedy('subscription-ended')).toMatch(/claude\.ai/i);
  });

  it('takes the account out of the rotation at once: no clock renews a subscription', () => {
    expect(needsHerHands('subscription-ended')).toBe(true);
    expect(causeAct('subscription-ended')).toBe(null);
  });

  it('puts a sentence on the row that opens under 112 characters and reads back as itself', () => {
    const row = deadRunSentence({ engineWord: 'Claude Code', cause: 'subscription-ended', runs: 2 });
    expect(`${row.split('. ')[0]}.`.length).toBeLessThan(112);
    expect(deadRunCause(row)).toBe('subscription-ended');
    expect(deadRunCause(deadRunSentence({ cause: 'org-blocked' }))).toBe('org-blocked');
  });

  it('counts it apart from an admin block in the pile above the list', () => {
    const out = causeBreakdown([{ cause: 'subscription-ended' }, { cause: 'org-blocked' }]);
    expect(out.map((c) => c.cause).sort()).toEqual(['org-blocked', 'subscription-ended']);
    expect(causeWord('subscription-ended')).not.toBe(causeWord('org-blocked'));
  });

  // The thread sees only the refusal text, which is the same for both, so its
  // line must be true of both and blame nobody.
  it('says only that the account was refused on the line in a thread, which cannot tell which', () => {
    expect(runStoppedLine(REFUSAL)).toBe('This run stopped because Claude Code will not run on that account.');
  });
});

describe('the fleet, on a real refusal', () => {
  const setUp = (oauthAccount) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-ended-home-'));
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount }));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-ended-store-'));
    const sup = new Supervisor(
      { home, storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
      { listItems: () => [], listProducts: () => [] },
      '/nonexistent-app',
    );
    const refuse = () => sup.noteExitForBackoff({
      itemId: 'w-test', product: 'agentbox', profile: 'default',
      startedAt: Date.now() - 2_000, tail: [`stderr: ${REFUSAL}`, 'session exited (1)'],
    });
    return { home, sup, refuse };
  };

  it('files a lapsed login as subscription-ended', () => {
    const { sup, refuse } = setUp(lapsed);
    refuse();
    expect(sup._profileTrouble.default?.cause).toBe('subscription-ended');
  });

  it('files a paying login that is refused as org-blocked, as before', () => {
    const { sup, refuse } = setUp(paying);
    refuse();
    expect(sup._profileTrouble.default?.cause).toBe('org-blocked');
  });

  it('lets the account back in once the login pays again, and not before', () => {
    const { home, sup, refuse } = setUp(lapsed);
    refuse();
    sup._forgetRenewedSubscriptions();
    expect(sup._profileTrouble.default?.cause).toBe('subscription-ended');
    const file = path.join(home, '.claude.json');
    fs.writeFileSync(file, JSON.stringify({ oauthAccount: paying }));
    // THE PLAN IS CACHED ON THIS FILE'S mtime (main/claude-plan.mjs). Both
    // writes here land inside one millisecond often enough that the second
    // read came back from the cache still lapsed, and this test failed about
    // two runs in three. A real renewal is minutes apart; the clock is moved
    // on by hand so the read is a read.
    const after = new Date(Date.now() + 1_000);
    fs.utimesSync(file, after, after);
    sup._forgetRenewedSubscriptions();
    expect(sup._profileTrouble.default).toBeUndefined();
  });
});
