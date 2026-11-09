// EVERY SYNTHETIC TESTER RUNS ON CODEX (w-bb45118b10, 2026-11-08).
//
// The person bought a Codex plan for testing only and asked that synthetic
// users never run on Claude Code. Before this, power-test started every tester
// as `claude -p` (its only engine), and the product loop could be pointed at a
// Claude plan with --engine claude. Both now start `codex exec`, on the Codex
// login with the best plan unless one is named, and refuse anything else. On a
// machine whose Codex cannot sandbox (the Agentbox cloud: bwrap is refused),
// measured with `codex sandbox -- true` exiting 1, the tester runs unsandboxed
// rather than not at all.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planOf, codexLogins, testerLogin, codexTesterArgv, codexTesterEnv, codexCanSandbox, planRank } from '../.claude/skills/power-test/scripts/codex-tester.mjs';
import { testerArgv, testerEnv } from '../.claude/skills/product-loop/scripts/workday.mjs';
import { paceFor, readingFromLimits } from '../.claude/skills/product-loop/scripts/pace.mjs';
import { nextRound, roundOutcome } from '../.claude/skills/power-test/scripts/plan.mjs';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const jwt = (plan) => `x.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_plan_type: plan } })).toString('base64url')}.y`;
function homeWith(logins) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-logins-'));
  for (const [name, plan] of Object.entries(logins)) {
    fs.mkdirSync(path.join(home, name));
    if (plan !== undefined) fs.writeFileSync(path.join(home, name, 'auth.json'), JSON.stringify({ tokens: { id_token: jwt(plan) } }));
  }
  return home;
}

describe('which Codex login the testers spend', () => {
  it('reads the plan off the login itself', () => {
    const home = homeWith({ '.codex': 'plus' });
    expect(planOf(path.join(home, '.codex'))).toBe('plus');
    expect(planOf(path.join(home, 'nowhere'))).toBeNull();
  });

  it('the login on the best plan, not the first one found', () => {
    const home = homeWith({ '.codex': 'free', '.codex-2': 'plus', '.codex-3': 'pro' });
    expect(testerLogin({ homeDir: home })).toMatchObject({ home: path.join(home, '.codex-3'), plan: 'pro' });
  });

  it('a paid plan it has never heard of ranks above Plus, and free stays last', () => {
    expect(planRank('some-new-plan')).toBeGreaterThan(planRank('plus'));
    expect(planRank('free')).toBeLessThan(planRank('plus'));
    const home = homeWith({ '.codex': 'plus', '.codex-2': 'some-new-plan' });
    expect(testerLogin({ homeDir: home }).home).toBe(path.join(home, '.codex-2'));
  });

  it('the login named, whatever its plan', () => {
    const home = homeWith({ '.codex': 'pro', '.codex-2': 'plus' });
    expect(testerLogin({ given: path.join(home, '.codex-2'), homeDir: home })).toMatchObject({ plan: 'plus', why: 'named' });
    expect(testerLogin({ given: '~/.codex-2', homeDir: home }).home).toBe(path.join(home, '.codex-2'));
  });

  it('only folders that are Codex logins: no auth.json, or another name, is not one', () => {
    const home = homeWith({ '.codex': undefined, '.codexish': 'pro', '.claude': 'pro' });
    expect(codexLogins(home)).toEqual([]);
    expect(testerLogin({ homeDir: home })).toBeNull();
  });
});

describe('how a tester starts', () => {
  const dir = '/tmp/power/founder';

  it('as codex exec, sandboxed with the local network open, its log kept', () => {
    const argv = codexTesterArgv({ dir, prompt: 'go', last: `${dir}/last.txt` });
    expect(argv.slice(0, 3)).toEqual(['exec', '-C', dir]);
    expect(argv).toContain('workspace-write');
    expect(argv).toContain('sandbox_workspace_write.network_access=true');
    expect(argv).not.toContain('--ephemeral');
    expect(argv).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(argv.at(-1)).toBe('go');
  });

  it('unsandboxed only when told the machine cannot sandbox', () => {
    const argv = codexTesterArgv({ dir, prompt: 'go', last: `${dir}/last.txt`, sandboxed: false });
    expect(argv).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(argv).not.toContain('workspace-write');
  });

  it('asks Codex itself whether it can sandbox here, without a model call', () => {
    let asked = null;
    expect(codexCanSandbox({ run: (bin, args) => { asked = [bin, ...args]; return { status: 1 }; } })).toBe(false);
    expect(asked).toEqual(['codex', 'sandbox', '--', 'true']);
    expect(codexCanSandbox({ run: () => ({ status: 0 }) })).toBe(true);
  });

  it('on the chosen login, with no API key that would bill past the plan', () => {
    const env = codexTesterEnv({ PATH: '/bin', OPENAI_API_KEY: 'sk-x', CODEX_API_KEY: 'k', CODEX_HOME: '/other' }, '/h/.codex-2');
    expect(env).toEqual({ PATH: '/bin', CODEX_HOME: '/h/.codex-2' });
  });

  it('never names the app copy\'s folder, which a power test\'s sleep freezes everything naming', () => {
    const argv = codexTesterArgv({ dir, prompt: 'go', last: `${dir}/last.txt` });
    expect(argv.join(' ')).not.toContain('--add-dir');
  });
});

describe('neither runner can start a tester on Claude Code', () => {
  it('the product loop refuses a Claude engine', () => {
    expect(() => testerArgv('claude', { dir: '/d', prompt: 'go', last: '/d/l' })).toThrow(/codex/);
    expect(testerArgv('codex', { dir: '/d', prompt: 'go', last: '/d/l' })[0]).toBe('exec');
    expect(testerEnv('codex', { PATH: '/bin', ANTHROPIC_API_KEY: 'a' }, { codexHome: '/h/.codex-2' }).CODEX_HOME).toBe('/h/.codex-2');
  });

  it('the power test starts codex, and nothing in either runner starts claude', () => {
    const power = read('.claude/skills/power-test/scripts/power-test.mjs');
    const day = read('.claude/skills/product-loop/scripts/workday.mjs');
    expect(power).toMatch(/spawn\('codex', codexTesterArgv\(/);
    for (const text of [power, day]) {
      expect(text).not.toMatch(/spawn\(claude|run\('claude'|findClaudeBin|'-p', prompt/);
    }
  });

  it('the skills say so, so an agent reading them does not reach for Claude Code', () => {
    for (const skill of ['.claude/skills/power-test/SKILL.md', '.claude/skills/product-loop/SKILL.md']) {
      const text = read(skill);
      expect(text).toMatch(/Codex, never Claude Code/);
      expect(text).not.toMatch(/--engine claude|--claude-home|--testers external|--tester-login|run it as a subagent/);
    }
  });
});

describe('a tester out of Codex says so', () => {
  it('a signed-out Codex ends the test as signed out, and says Codex', () => {
    expect(roundOutcome({ actions: 0, text: 'unexpected status 401 Unauthorized: Missing bearer' })).toBe('signed-out');
    expect(nextRound({ now: 0, deadline: 60 * 60_000, roundMs: 60_000, lastOutcome: 'signed-out' }).why).toMatch(/Codex/);
  });

  it('a Codex usage limit ends it as out of usage', () => {
    expect(roundOutcome({ actions: 0, text: "You've hit your usage limit. Try again in 3 days." })).toBe('tester-out');
    expect(nextRound({ now: 0, deadline: 60 * 60_000, roundMs: 60_000, lastOutcome: 'tester-out' }).why).toMatch(/Codex/);
  });

  it('but a tester that acted and read those words on screen is not itself out', () => {
    expect(roundOutcome({ actions: 12, text: 'the thread said You\'ve hit your usage limit' })).toBe('acted');
  });
});

describe('the Codex week is paced the same way', () => {
  it('reads the fullest week Codex reports', () => {
    const now = Date.parse('2026-11-08T12:00:00Z');
    const reading = readingFromLimits([{ span: 'week', percent: 20, resetsAt: now + 3600_000 }, { span: 'session', percent: 5, resetsAt: now + 60_000 }]);
    expect(reading.week.percent).toBe(20);
  });

  it('runs one stretch with no reading yet, which writes one', () => {
    expect(paceFor(null).verdict).toBe('run');
  });
});
