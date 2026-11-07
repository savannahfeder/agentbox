// WHICH CLAUDE PLAN AGENTBOX IS RUNNING ON.
//
// From a tester's onboarding, 2026-08-24, the founder's own bullet while she
// watched: "not on max plan?". Agentbox started three sessions at once on
// somebody else's subscription and nothing in the app had ever mentioned a
// plan, so neither of them could tell whether that was the problem.
//
// The two halves worth protecting here are opposite ones. Agentbox must be able
// to READ the plan, out of Claude Code's own config file and in the same place
// Claude Code puts it. And Agentbox must change NOTHING for a machine whose plan
// it cannot read: no smaller cap, no invented label, no worse app than the one
// that was there before this file existed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planFile, planLabel, isMaxTier, readPlan, readPlans, slotsForPlans } from '../main/claude-plan.mjs';
import { NAME } from '../shared/product-name.mjs';

let home;

// The shape Claude Code actually writes, cut down to the keys this reads. A
// real file carries about forty more and none of them matter here.
const layAccount = (at, account) => {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, JSON.stringify({ numStartups: 12, oauthAccount: { emailAddress: 'someone@example.com', ...account } }));
};

const MAX_20X = { organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x' };

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-plan-'));
});

afterEach(() => {
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
});

describe('where the file is', () => {
  // Claude Code keeps its config at CLAUDE_CONFIG_DIR when that is set and at
  // the home folder when it is not, and Agentbox's default account is the one
  // that sets nothing. Verified against a real Mac: the live file for the
  // default account is ~/.claude.json, and the one for a second account is
  // ~/.claude-second/.claude.json.
  it('the default account reads the file beside the home folder, not inside ~/.claude', () => {
    expect(planFile('default', home)).toBe(path.join(home, '.claude.json'));
    expect(planFile('default', home)).not.toBe(path.join(home, '.claude', '.claude.json'));
  });

  it('a second account reads the file inside the folder CLAUDE_CONFIG_DIR names', () => {
    expect(planFile('/somewhere/.claude-second', home)).toBe('/somewhere/.claude-second/.claude.json');
  });

  it('a profile written with a tilde is read under the home folder', () => {
    expect(planFile('~/.claude-second', home)).toBe(path.join(home, '.claude-second', '.claude.json'));
  });

  // A ~/.claude/.claude.json can exist and be days stale: it is what a run
  // with CLAUDE_CONFIG_DIR=~/.claude left behind.
  // Reading it for the default account would report a plan from a login that is
  // no longer the one sessions run on.
  it('a stale file inside ~/.claude is not read for the default account', () => {
    layAccount(path.join(home, '.claude', '.claude.json'), { organizationRateLimitTier: 'default_claude_pro' });
    expect(readPlan('default', { home }).known).toBe(false);
  });
});

describe('what the plan is called', () => {
  it("names a real plan string", () => {
    expect(planLabel('default_claude_max_20x')).toBe('Max 20x');
  });

  // No table of plan names is kept anywhere, because a table would hold
  // strings nobody here has seen in a real file, which is inventing them. A string this
  // code has never met still has to come out as words.
  it('a plan nobody here has seen still reads as itself', () => {
    expect(planLabel('default_claude_pro')).toBe('Pro');
    expect(planLabel('claude_max_5x')).toBe('Max 5x');
    expect(planLabel('some_new_thing')).toBe('Some New Thing');
  });

  it('nothing is not a name', () => {
    expect(planLabel('')).toBe(null);
    expect(planLabel(null)).toBe(null);
    expect(planLabel('default_')).toBe(null);
  });

  it('max is a whole word', () => {
    expect(isMaxTier('default_claude_max_20x')).toBe(true);
    expect(isMaxTier('claude_max')).toBe(true);
    expect(isMaxTier('default_claude_pro')).toBe(false);
    expect(isMaxTier('maximum_effort')).toBe(false);
  });
});

describe('reading one account', () => {
  it('reads the plan the way it is really written', () => {
    layAccount(path.join(home, '.claude.json'), MAX_20X);
    const plan = readPlan('default', { home });
    expect(plan).toMatchObject({ known: true, max: true, label: 'Max 20x', tier: 'default_claude_max_20x', from: 'org-tier' });
  });

  it('falls back to the organisation type when there is no rate limit tier', () => {
    layAccount(path.join(home, '.claude.json'), { organizationType: 'claude_max' });
    expect(readPlan('default', { home })).toMatchObject({ known: true, max: true, label: 'Max', from: 'org-type' });
  });

  it('a plan that is not max is read as one', () => {
    layAccount(path.join(home, '.claude.json'), { organizationType: 'claude_pro', organizationRateLimitTier: 'default_claude_pro' });
    expect(readPlan('default', { home })).toMatchObject({ known: true, max: false, label: 'Pro' });
  });

  // Every one of these is a real state a machine can be in: Claude Code never
  // installed, a login that has not fetched a profile yet, a file half written
  // by a crash. None of them may throw and none of them may claim a plan.
  it('says it does not know rather than guessing', () => {
    expect(readPlan('default', { home }).known).toBe(false);

    layAccount(path.join(home, '.claude.json'), {});
    expect(readPlan('default', { home }).known).toBe(false);

    fs.writeFileSync(path.join(home, '.claude.json'), '{ this is not json');
    expect(readPlan('default', { home }).known).toBe(false);

    fs.writeFileSync(path.join(home, '.claude.json'), '{"oauthAccount":"nope"}');
    expect(readPlan('default', { home }).known).toBe(false);
  });
});

describe(`reading every account ${NAME} runs on`, () => {
  it('keeps the order the supervisor round-robins in', () => {
    layAccount(path.join(home, '.claude.json'), MAX_20X);
    layAccount(path.join(home, '.claude-second', '.claude.json'), { organizationRateLimitTier: 'default_claude_pro' });
    const plans = readPlans(['default', path.join(home, '.claude-second')], { home });
    expect(plans.map((p) => p.profile)).toEqual(['default', path.join(home, '.claude-second')]);
    expect(plans.map((p) => p.label)).toEqual(['Max 20x', 'Pro']);
  });

  it('no accounts configured still means the default one', () => {
    layAccount(path.join(home, '.claude.json'), MAX_20X);
    expect(readPlans([], { home }).map((p) => p.label)).toEqual(['Max 20x']);
  });
});

describe('how many run at once when nobody has said', () => {
  const plan = (over) => ({ known: true, max: false, label: 'Pro', ...over });

  it('a max plan runs the three it always ran', () => {
    expect(slotsForPlans([plan({ max: true, label: 'Max 20x' })], 3)).toBe(3);
  });

  it('a plan that is not max runs one at a time', () => {
    expect(slotsForPlans([plan()], 3)).toBe(1);
  });

  // The cap is one number applied per account, so with a Max account and a
  // smaller one there is no way to give them different numbers. The smaller
  // one decides, because an under-run leaves a working app and an over-run
  // spends somebody's allowance three times as fast.
  it('the smallest account decides', () => {
    expect(slotsForPlans([plan({ max: true }), plan()], 3)).toBe(1);
  });

  // The whole safety of this. A machine Agentbox cannot read gets exactly the
  // app it had before any of this existed.
  it('an unreadable account never lowers anything', () => {
    expect(slotsForPlans([], 3)).toBe(3);
    expect(slotsForPlans([{ known: false, max: false }], 3)).toBe(3);
    expect(slotsForPlans([{ known: false }, plan({ max: true })], 3)).toBe(3);
    expect(slotsForPlans(undefined, 3)).toBe(3);
  });
});
