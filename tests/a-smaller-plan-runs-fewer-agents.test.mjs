// HOW MANY AGENTS AGENTBOX STARTS FOR SOMEBODY WHO IS NOT ON A MAX PLAN.
//
// 2026-08-29. `maxConcurrentSessions: 3` was chosen on a Max subscription and
// never revisited, and nothing in the app had ever mentioned a plan. So a
// stranger got three sessions started for them against whatever they were
// paying for, and the founder's own bullet from a tester's onboarding was the
// question "not on max plan?" asked while she watched it happen.
//
// The half this protects hardest is the one that must NOT change: a machine
// whose plan cannot be read, and a person who set their own number, both get
// exactly the app they had before any of this existed.
//
// WHAT "THE THREE IT ALWAYS HAD" MEANS CHANGED ON 2026-09-22. The number a plan
// falls back to is no longer a flat 3; it is what the hardware suggests
// (main/machine.mjs, one agent per 4 GB), because a Max subscription on an 8 GB
// laptop is exactly the case a plan reading cannot see. So the checks below are
// written against `machineSlots()` rather than against a literal: a literal
// would pass on the Mac it was written on and fail on the next one. The claim
// each of them makes is unchanged, which is that the PLAN adds nothing here.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../main/config.mjs';
import { machineSlots } from '../main/machine.mjs';
import { NAME } from '../shared/product-name.mjs';

let home;
let appDir;

const layPlan = (at, tier) => {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, JSON.stringify({ oauthAccount: { organizationRateLimitTier: tier } }));
};

const layConfig = (over) => fs.writeFileSync(path.join(appDir, 'zero.config.json'), JSON.stringify(over));

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-slots-home-'));
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-slots-app-'));
});

afterEach(() => {
  for (const d of [home, appDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
});

describe(`a plan ${NAME} can read`, () => {
  it('a max plan leaves the machine to decide', () => {
    layPlan(path.join(home, '.claude.json'), 'default_claude_max_20x');
    const config = loadConfig(appDir, { home });
    expect(config.maxConcurrentSessions).toBe(machineSlots().slots);
    // Nothing is said on the Agents page, because nothing surprising happened.
    expect(config.planSlotsFrom).toBe(null);
  });

  it('a smaller plan runs one at a time, and the page can say which plan', () => {
    layPlan(path.join(home, '.claude.json'), 'default_claude_pro');
    const config = loadConfig(appDir, { home });
    expect(config.maxConcurrentSessions).toBe(1);
    expect(config.planSlotsFrom).toBe('Pro');
  });

  // The cap is one number applied per account, so a Max account and a smaller
  // one cannot be given different ones. Spending somebody's allowance three
  // times as fast is the worse of the two mistakes available here.
  it('with two accounts the smaller plan decides', () => {
    layPlan(path.join(home, '.claude.json'), 'default_claude_max_20x');
    layPlan(path.join(home, '.claude-second', '.claude.json'), 'default_claude_pro');
    layConfig({ authProfiles: ['default', path.join(home, '.claude-second')] });
    expect(loadConfig(appDir, { home }).maxConcurrentSessions).toBe(1);
  });
});

describe('what must not change', () => {
  it('a Mac with no Claude Code config keeps what the machine suggests', () => {
    const config = loadConfig(appDir, { home });
    expect(config.maxConcurrentSessions).toBe(machineSlots().slots);
    expect(config.planSlotsFrom).toBe(null);
  });

  it('a half written config file changes nothing', () => {
    fs.writeFileSync(path.join(home, '.claude.json'), '{ not json at all');
    expect(loadConfig(appDir, { home }).maxConcurrentSessions).toBe(machineSlots().slots);
  });

  // Hers is 4, set by hand, and it stays 4 whatever any plan says. This is the
  // test that keeps a settings screen honest: a stepper she moved may never be
  // moved back by the app.
  it('a number she set herself always wins', () => {
    layPlan(path.join(home, '.claude.json'), 'default_claude_pro');
    layConfig({ maxConcurrentSessions: 4 });
    const config = loadConfig(appDir, { home });
    expect(config.maxConcurrentSessions).toBe(4);
    expect(config.planSlotsFrom).toBe(null);
  });

  it('a number she set that happens to equal the default still wins', () => {
    layPlan(path.join(home, '.claude.json'), 'default_claude_pro');
    layConfig({ maxConcurrentSessions: 3 });
    expect(loadConfig(appDir, { home }).maxConcurrentSessions).toBe(3);
  });
});
