// A PRO PLAN RUNS AS MANY AGENTS AS THE COMPUTER CARRIES (w-54c640f8da).
//
// Any Claude login that was not on Max held Automatic to one agent at a time,
// whatever the computer could carry, and the Agents page said "Your plan is
// Pro, so Agentbox starts one at a time." A plan's limit is a budget over five
// hours and a week, not a number of lanes: four agents at once spend about what
// four in a row do, sooner. Running out is already handled: the account waits
// for its reset (a-task-whose-account-is-out-of-usage-waits-for-the-reset) and
// a run the limit stopped resumes its own session
// (a-run-its-limit-stopped-picks-up-its-own-session).
//
// Measured before the change, with the computer pinned at six: loadConfig on a
// home signed in to Pro answered `maxConcurrentSessions: 1` and
// `planSlotsFrom: 'Pro'`, and the supervisor ran one Claude Code agent.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIX = 6;
vi.mock('../main/machine.mts', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    machineSlots: (m) => (m && m.memBytes ? real.machineSlots(m) : { slots: SIX, memGb: 24, cores: 10, byMemory: SIX, byCores: 8, known: true }),
  };
});

const { loadConfig } = await import('../main/config.mts');
const { autoAgents } = await import('../main/machine.mts');
const { Supervisor } = await import('../main/supervisor.mts');
const { NAME } = await import('../shared/product-name.mjs');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAC = { memBytes: 24 * 1024 ** 3, cores: 10 };

let home;
let appDir;
const made = [];

const layPlan = (at, tier) => {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, JSON.stringify({ oauthAccount: { emailAddress: 'you@example.com', accountUuid: `uuid-${at}`, organizationRateLimitTier: tier } }));
};
const layConfig = (over) => fs.writeFileSync(path.join(appDir, 'zero.config.json'), JSON.stringify(over));

function supervisorFor(config, engines = ['claude']) {
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null };
  const s = new Supervisor({ ...config, storeRoot: appDir, home }, store, root, appDir, appDir);
  s._liveProfilesFor = () => ['default'];
  s.engineChoices = () => engines.map((id) => ({ id }));
  s._machine = () => MAC;
  made.push(s);
  return s;
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-agents-home-'));
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-agents-app-'));
});

afterEach(() => {
  for (const s of made.splice(0)) s.stopMemoryGate?.();
  for (const d of [home, appDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
});

describe('a login that is not on Max', () => {
  it('gets what the computer carries, not one', () => {
    layPlan(path.join(home, '.claude.json'), 'default_claude_pro');
    const config = loadConfig(appDir, { home });
    expect(config.maxConcurrentSessions).toBe(SIX);
    expect(config.planSlotsFrom ?? null).toBe(null);
    expect(supervisorFor(config)._capacity()).toBe(autoAgents({ ...MAC, gated: config.memoryGate }));
  });

  it('runs the same number as a Max login on the same computer', () => {
    layPlan(path.join(home, '.claude.json'), 'default_claude_max_20x');
    const max = supervisorFor(loadConfig(appDir, { home }))._capacity();
    layPlan(path.join(home, '.claude.json'), 'default_claude_pro');
    const pro = supervisorFor(loadConfig(appDir, { home }))._capacity();
    expect(pro).toBe(max);
  });

  it('does not hold back a Max login signed in beside it', () => {
    layPlan(path.join(home, '.claude.json'), 'default_claude_max_20x');
    layPlan(path.join(home, '.claude-second', '.claude.json'), 'default_claude_pro');
    layConfig({ authProfiles: ['default', path.join(home, '.claude-second')] });
    expect(loadConfig(appDir, { home }).maxConcurrentSessions).toBe(SIX);
  });

  it('gives Claude Code and Codex the same number', () => {
    layPlan(path.join(home, '.claude.json'), 'default_claude_pro');
    const config = loadConfig(appDir, { home });
    const s = supervisorFor(config, ['claude', 'codex']);
    expect(s._capacityFor('claude')).toBe(s._capacityFor('codex'));
    expect(s._capacityFor('claude')).toBe(autoAgents({ ...MAC, gated: config.memoryGate }));
  });
});

describe('what must not change', () => {
  it('a number set by hand still wins, lower or higher', () => {
    layPlan(path.join(home, '.claude.json'), 'default_claude_pro');
    for (const n of [1, 2, 9]) {
      layConfig({ agentsAtOnce: n, agentsAuto: false });
      const s = supervisorFor(loadConfig(appDir, { home }), ['claude', 'codex']);
      expect(s._capacity()).toBe(n);
    }
  });

  it('a computer with no Claude Code sign-in gets what it carries', () => {
    expect(loadConfig(appDir, { home }).maxConcurrentSessions).toBe(SIX);
  });
});

describe('the Agents page', () => {
  const settings = fs.readFileSync(path.join(root, 'renderer/src/components/Settings.tsx'), 'utf8');
  const template = (() => {
    const at = settings.indexOf('desc={', settings.indexOf('label="How many run at once"'));
    expect(at).toBeGreaterThan(-1);
    const start = at + 'desc={'.length;
    let depth = 1;
    let i = start;
    for (; i < settings.length && depth; i++) {
      if (settings[i] === '{') depth++;
      else if (settings[i] === '}') depth--;
    }
    return settings.slice(start, i - 1);
  })();
  // eslint-disable-next-line no-new-func
  const say = (w) => new Function('w', 'NAME', 'twoEngines', `return (${template});`)(w, NAME, true);

  // A renderer left open across the update can still be handed the old field.
  it('never says the plan decided how many run', () => {
    for (const agentsAuto of [true, false]) {
      const said = say({ sessionsAtOnceFromPlan: 'Pro', agentsAuto, agentsAutoTotal: 6, sessionsAtOnce: 1 });
      expect(said).not.toMatch(/plan/i);
      expect(said).not.toMatch(/one .*at a time/);
    }
  });
});
