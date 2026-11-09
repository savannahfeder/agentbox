// THE PHONE SHOWS WHAT IS LEFT OF EACH ACCOUNT'S USAGE.
//
// The desktop's Claude Code and Codex pages draw each account's session and
// week meters (Settings.tsx `MiniMeters`, ⌘K's "Usage and limits": "what is
// left of your week"). The phone's account rows said only the plan: the
// computer's copy carried no reading at all (measured 2026-11-08). The copy now
// carries each account's last reading, numbers and reset times only, read
// without starting a `claude /usage` on the computer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneSettingsOf } from '../shared/phone-settings.mts';
import { AccountUsage } from '../main/account-usage.mts';
import { phoneCommands } from '../mobile/src/lib/palette';

const HOME = '/Users/someone';
const AT = Date.parse('2026-11-08T12:00:00Z');
const limit = (over = {}) => ({ span: 'session', qualifier: null, name: 'This session', percent: 34, resetsText: '6pm', resetsOn: null, resetsAt: AT + 3_600_000, zone: 'Europe/London', ...over });
const model = (usage) => ({
  ok: true,
  usage,
  workspace: {
    memoryGate: {}, leftovers: {},
    accounts: [
      { profile: 'default', email: 'me@example.com', chosen: true, state: 'live' },
      { profile: `${HOME}/.claude-2`, email: 'work@example.com', chosen: false, state: 'live' },
    ],
    codex: { found: true, accounts: [{ profile: 'default', email: 'c@example.com', signedIn: true, chosen: true }] },
  },
  projects: [],
});

describe('the copy the computer sends', () => {
  const usage = {
    claude: [{ profile: `${HOME}/.claude-2`, at: AT, limits: [limit(), limit({ span: 'week', qualifier: 'all models', name: 'This week', percent: 61, raw: `${HOME}/secret` })] }],
    codex: [{ profile: 'default', at: AT, limits: [limit({ span: 'week', percent: 12, resetsText: null, zone: null })] }],
  };
  const copy = phoneSettingsOf(model(usage), { version: '1' });

  it('gives each account its own reading, and none to an account with none', () => {
    expect(copy.workspace.accounts[0].usage).toBeNull();
    expect(copy.workspace.accounts[1].usage).toEqual({
      at: AT,
      limits: [
        { span: 'session', qualifier: null, name: 'This session', percent: 34, resetsText: '6pm', resetsOn: null, resetsAt: AT + 3_600_000, reset: false },
        { span: 'week', qualifier: 'all models', name: 'This week', percent: 61, resetsText: '6pm', resetsOn: null, resetsAt: AT + 3_600_000, reset: false },
      ],
    });
    expect(copy.workspace.codexAccounts[0].usage.limits[0]).toMatchObject({ span: 'week', percent: 12 });
  });

  it('carries no folder and nothing the reading had besides its numbers', () => {
    expect(JSON.stringify(copy)).not.toMatch(/\/Users\/|secret|Europe/);
  });

  it('is no reading at all from a computer that sent none', () => {
    const none = phoneSettingsOf(model(undefined), { version: '1' });
    expect(none.workspace.accounts.map((a) => a.usage)).toEqual([null, null]);
    expect(none.workspace.codexAccounts[0].usage).toBeNull();
  });

  it('drops a limit with no number', () => {
    const odd = phoneSettingsOf(model({ claude: [{ profile: 'default', at: AT, limits: [limit({ percent: 'lots' }), limit({ span: 'week' })] }] }), { version: '1' });
    expect(odd.workspace.accounts[0].usage.limits.map((l) => l.span)).toEqual(['week']);
  });
});

describe('the computer\'s side', () => {
  it('reads an account\'s last reading without starting anything', () => {
    const run = () => { throw new Error('a usage read was started'); };
    const reader = new AccountUsage({ bin: () => '/bin/claude', run });
    expect(reader.peek('default')).toBeNull();
  });

  it('hands the phone pass the cloud and every account\'s last reading with its settings', () => {
    const main = fs.readFileSync(new URL('../main/main.mts', import.meta.url), 'utf8');
    expect(main).toMatch(/phoneSettings = async \(\) =>/);
    expect(main).toMatch(/cloud: supervisor\.cloudStatus\(\)/);
    expect(main).toMatch(/usage: ipc\.usageForPhone\(\)/);
    const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
    expect(ipc).toMatch(/accountUsage\.peek\(/);
  });
});

describe('the phone', () => {
  it('draws the desktop\'s meters on each account row', () => {
    const src = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/<Meters meters=\{meterPair\(a\.usage\?\.limits/);
  });

  it('has Usage and limits in its commands, opening the Claude Code page', () => {
    const row = phoneCommands({ team: false, computer: { paused: false, projects: [], order: [] } }).find((c) => c.id === 'usage');
    expect(row).toMatchObject({ label: 'Usage and limits', act: { push: '/settings/claude' } });
    expect(phoneCommands({ team: false }).map((c) => c.id)).not.toContain('usage');
  });
});
