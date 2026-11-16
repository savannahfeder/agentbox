// CLAUDE CODE USAGE READ IN SETTINGS REACHES THE SIDEBAR.
//
// QA, 2026-11-15: with Claude Code (Week 67%) and Codex (Week 86%) both signed
// in and Codex the agent the sidebar was about, the sidebar listed only
// "Codex 86%" while Settings › Claude Code showed 67%. While Codex is the
// corner's agent the snapshot only peeks at the Claude reader (it must not
// start `claude /usage` to draw itself), and Settings reads each login with
// its own readers, so the figure Settings had was never handed over and
// Claude Code was missing from the sidebar and its hover panel.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ClaudeUsage } from '../main/claude-usage.mts';

const limits = (percent: number) => [{ span: 'week', qualifier: null, name: 'This week', percent, resetsAt: 9_999_999 }];

function reader(profile = 'default') {
  let runs = 0;
  let changes = 0;
  const usage = new ClaudeUsage({
    bin: () => '/somewhere/claude',
    account: () => ({ profile, env: { PATH: '/bin' } }),
    run: () => { runs += 1; },
    now: () => 5_000,
    where: () => '/tmp/x',
    onChange: () => { changes += 1; },
  });
  return { usage, runs: () => runs, changes: () => changes };
}

describe('a reading Settings took of the account in use', () => {
  it('is what the sidebar peeks at, without starting Claude Code', () => {
    const r = reader();
    r.usage.adopt({ profile: 'default', at: 4_000, limits: limits(67) });
    expect(r.usage.peek()?.limits[0].percent).toBe(67);
    expect(r.changes()).toBe(1);
    expect(r.runs()).toBe(0);
  });

  it('replaces an older reading', () => {
    const r = reader();
    r.usage.adopt({ profile: 'default', at: 1_000, limits: limits(40) });
    r.usage.adopt({ profile: 'default', at: 4_000, limits: limits(67) });
    expect(r.usage.peek()?.limits[0].percent).toBe(67);
  });

  it('never replaces a newer one', () => {
    const r = reader();
    r.usage.adopt({ profile: 'default', at: 4_000, limits: limits(67) });
    r.usage.adopt({ profile: 'default', at: 1_000, limits: limits(40) });
    expect(r.usage.peek()?.limits[0].percent).toBe(67);
    expect(r.changes()).toBe(1);
  });

  it('is not taken for another login', () => {
    const r = reader('/h/.claude-2');
    r.usage.adopt({ profile: 'default', at: 4_000, limits: limits(67) });
    expect(r.usage.peek()).toBe(null);
    expect(r.changes()).toBe(0);
  });

  it('is not taken when it carries no limits', () => {
    const r = reader();
    r.usage.adopt({ profile: 'default', at: 4_000, limits: [] });
    r.usage.adopt({ profile: 'default', at: 4_000 });
    expect(r.usage.peek()).toBe(null);
  });
});

describe('the app', () => {
  it('hands every new Settings reading to the sidebar reader', () => {
    const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
    const wiring = ipc.slice(ipc.indexOf('new AccountUsage({'), ipc.indexOf("'zero:account-usage'"));
    expect(wiring).toMatch(/onReading: \(profile, reading\) => \{[^}]*usage\.adopt\(/s);
  });
});
