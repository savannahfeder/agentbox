// A WORKING CLAUDE LOGIN WITH NO EMAIL ON FILE READS AS SIGNED IN.
//
// What broke (2026-11-21): on a Linux computer whose Claude Code login lives in
// ~/.claude/.credentials.json, Settings › Claude Code said "Not signed in ·
// Finish signing in to use it", after Refresh too, while a real `claude -p`
// started by the same app answered and exited 0 in about 7 seconds. Measured on
// that computer: `claude auth status --json` said loggedIn true with email
// null, and ~/.claude.json had no oauthAccount block. Settings counted a login
// as signed in only once that block named an email, which Claude Code does not
// need in order to run.
//
// A login with no email now reads as signed in only on Claude Code's own yes
// from that check, which the app already asks at launch, and only for the
// default login. A credentials file proves nothing, whatever it holds. A run
// that was told "Not logged in" wins over everything, the email included.
//
// The words were approved for Claude only. Review found the first version also
// renamed a Codex login with an account id or plan but no email, on the desktop
// and the phone; the last block holds Codex to the words it had before.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { readSettings } from '../main/settings.mts';
import { forgetDiscovery } from '../main/account-discovery.mts';
import { phoneSettingsOf } from '../shared/phone-settings.mts';
import { USAGE_UNREADABLE } from '../shared/usage.mts';
import { accountsOnce, codexAccountsOnce } from '../renderer/src/accounts-once';
import { PlaceTiles, WebAccounts, accountTile, agentStory } from '../renderer/src/components/Settings';

type Layout = {
  email?: string | null;
  /** What `claude auth status` answered at launch; undefined is a check that never answered. */
  cli?: boolean;
  credentials?: 'empty' | 'corrupt' | 'stale' | null;
  signedOutRun?: boolean;
  /** A folder named in the config instead of the default login. */
  otherFolder?: boolean;
};

const made: string[] = [];

/** One home folder laid out as Claude Code leaves it, and the Claude row Settings reads off it. */
function rowFor({ email = null, cli, credentials = null, signedOutRun = false, otherFolder = false }: Layout) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-no-email-'));
  made.push(home);
  fs.mkdirSync(path.join(home, '.claude'));
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify(email ? { oauthAccount: { emailAddress: email, accountUuid: 'acct-1' } } : { numStartups: 3 }));
  const file = path.join(home, '.claude', '.credentials.json');
  if (credentials) fs.writeFileSync(file, credentials === 'corrupt' ? '{"claudeAi' : '{}');
  if (credentials === 'stale') fs.utimesSync(file, new Date('2025-01-01'), new Date('2025-01-01'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-other-login-'));
  made.push(other);
  forgetDiscovery();
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  const config = {
    home, storeRoot: home, accountRoot: home, appDir: home,
    claudeBin: '/nonexistent/claude', maxConcurrentSessions: 3, authProfiles: [otherFolder ? other : 'default'], sessionArgs: [],
    ...(cli === undefined ? {} : { claudeSignedIn: cli }),
  };
  const sup = new Supervisor(config as never, store as never, home);
  if (signedOutRun) {
    sup.noteExitForBackoff({ itemId: 'w-test', product: 'agentbox', profile: 'default', startedAt: Date.now() - 2_000, tail: ['stderr: Not logged in · Please run /login', 'session exited (1)'] } as never);
  }
  return readSettings({ config, supervisor: sup, store } as never, { search: false }).workspace.accounts[0] as { profile: string; email: string | null; signedIn?: boolean; chosen?: boolean };
}

describe('the Claude row the computer reads', () => {
  // A worker on an added login runs these tests with this set; the app's own check would not speak for 'default' then.
  beforeEach(() => { vi.stubEnv('CLAUDE_CONFIG_DIR', ''); });
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the reported case: Claude Code says signed in and no email is on file', () => {
    const row = rowFor({ cli: true });
    expect(row.email).toBeNull();
    expect(row.signedIn).toBe(true);
  });

  it('a check that never answered, or answered no, is not signed in', () => {
    expect(rowFor({}).signedIn).toBe(false);
    expect(rowFor({ cli: false }).signedIn).toBe(false);
  });

  it('a credentials file alone is never signed in, empty, corrupt or stale', () => {
    expect(rowFor({ credentials: 'empty' }).signedIn).toBe(false);
    expect(rowFor({ credentials: 'corrupt' }).signedIn).toBe(false);
    expect(rowFor({ credentials: 'stale' }).signedIn).toBe(false);
  });

  it('an email on file is signed in, as before, unless Claude Code said no for that login', () => {
    expect(rowFor({ email: 'one@example.test' }).signedIn).toBe(true);
    expect(rowFor({ email: 'one@example.test', cli: true }).signedIn).toBe(true);
    expect(rowFor({ email: 'one@example.test', cli: false }).signedIn).toBe(false);
  });

  it('Claude Code\'s no for the default login does not reach another login with an email', () => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', '/somewhere/else');
    expect(rowFor({ email: 'one@example.test', cli: false }).signedIn).toBe(true);
  });

  it('a run there that was told Not logged in wins, over the email and over Claude Code\'s yes', () => {
    expect(rowFor({ email: 'one@example.test', signedOutRun: true }).signedIn).toBe(false);
    expect(rowFor({ cli: true, signedOutRun: true }).signedIn).toBe(false);
  });

  it('Claude Code\'s yes does not reach a login it was not asked about', () => {
    const row = rowFor({ cli: true, otherFolder: true });
    expect(row.profile).not.toBe('default');
    expect(row.signedIn).toBe(false);
    vi.stubEnv('CLAUDE_CONFIG_DIR', '/somewhere/else');
    expect(rowFor({ cli: true }).signedIn).toBe(false);
  });
});

const workspace = (accounts: object[]) => ({ claudeFound: true, accounts }) as never;
const tileOf = (row: object) => {
  const here = agentStory(workspace([row]), [], 'claude').accounts;
  const [one] = accountsOnce({ here });
  return accountTile(one, { many: false, now: Date.now(), onUse: vi.fn() });
};
const draw = (row: object) => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts: [tileOf(row)] }));

describe('the Claude Code page', () => {
  it('names a signed-in login with no email as a Claude account in use, and never asks to finish signing in', () => {
    const row = { profile: 'default', email: null, signedIn: true, chosen: true, plan: null, trouble: null };
    expect(tileOf(row).inUse).toBe(true);
    const html = draw(row);
    expect(html).toContain('Claude account');
    expect(html).not.toContain('Not signed in');
    expect(html).not.toContain('Finish signing in to use it');
  });

  it('still says Not signed in for a login the computer says is not signed in', () => {
    const row = { profile: 'default', email: null, signedIn: false, chosen: true, plan: null, trouble: null };
    expect(tileOf(row).inUse).toBe(false);
    const html = draw(row);
    expect(html).toContain('Not signed in');
  });

  it('names an identified login by its email', () => {
    const html = draw({ profile: 'default', email: 'one@example.test', signedIn: true, chosen: true, plan: null, trouble: null });
    expect(html).toContain('one@example.test');
    expect(html).not.toContain('Not signed in');
  });
});

// The after picture showed "Claude Code didn't report usage for this account.
// Check that its plan is active at claude.ai." on that same working login: a
// usage read that came back empty is not evidence about its plan.
describe('a usage read that came back empty', () => {
  const tile = (here: object, extra: object = {}) => accountTile({
    key: 'default', name: 'Claude account', plan: null, limits: null, checkedAt: null, usageError: USAGE_UNREADABLE, cloud: null,
    here: { profile: 'default', email: null, plan: null, chosen: true, signedIn: true, trouble: null, dir: null, ...here }, ...extra,
  } as never, { many: false, now: Date.now(), onUse: vi.fn() });
  const html = (t: ReturnType<typeof tile>) => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts: [t] }));

  it('does not tell a signed-in login with no trouble to check its plan', () => {
    const out = html(tile({}));
    expect(out).not.toContain('Check that its plan is active');
    expect(out).toContain('No usage reading yet');
  });

  it('still says so beside a login with a trouble of its own', () => {
    expect(tile({ trouble: 'This subscription has ended.' }).usageError).toBe(USAGE_UNREADABLE);
  });

  it('says nothing new for a login that is not signed in, and keeps a real reading', () => {
    expect(tile({ signedIn: false }).meters).toBe(false);
    const limits = [{ span: 'week', name: 'This week', percent: 40 }];
    const read = tile({}, { usageError: null, limits, checkedAt: Date.now() });
    expect(read.usageError).toBeNull();
    expect(read.limits).toEqual(limits);
  });
});

const copyOf = (accounts: object[]) => (phoneSettingsOf({
  ok: true,
  workspace: { permission: 'auto', codexMode: 'auto', memoryGate: {}, leftovers: {}, claudeFound: true, accounts, codex: { found: false } },
  projects: [],
} as never, { version: '1' }).workspace as { accounts: { email: string | null; signedIn: boolean; chosen: boolean; id: string; plan: string | null }[] }).accounts;

describe('the copy for the phone and the web app', () => {
  it('carries the computer\'s answer, not a guess from the email', () => {
    expect(copyOf([{ profile: 'default', email: null, signedIn: true, chosen: true }])[0].signedIn).toBe(true);
    expect(copyOf([{ profile: 'default', email: null, signedIn: false, chosen: true }])[0].signedIn).toBe(false);
  });

  it('the web app draws that login as a Claude account, not Not signed in', () => {
    const list = copyOf([{ profile: 'default', email: null, signedIn: true, chosen: true }]);
    const html = renderToStaticMarkup(React.createElement(WebAccounts, { engine: 'claude', list, reading: { value: null } as never, refusedAsk: null, onUse: vi.fn() }));
    expect(html).toContain('Claude account');
    expect(html).not.toContain('Not signed in');
    expect(html).not.toContain('Finish signing in to use it');
  });
});

describe('a Codex login signed in with no email keeps the words it had', () => {
  const codexRow = { profile: 'default', email: null, plan: 'Plus', chosen: true, signedIn: true };
  const here = () => agentStory({ codex: { found: true, accounts: [codexRow] } } as never, [], 'codex').accounts;

  it('on the desktop tile', () => {
    const [one] = codexAccountsOnce({ here: here() });
    expect(one.name).toBe('Not signed in');
    const html = renderToStaticMarkup(React.createElement(PlaceTiles, { accounts: [accountTile(one, { many: false, now: Date.now(), onUse: vi.fn(), engine: 'codex' })] }));
    expect(html).not.toContain('Codex account');
  });

  it('beside an empty usage read', () => {
    const [one] = codexAccountsOnce({ here: here() });
    const tile = accountTile({ ...one, usageError: USAGE_UNREADABLE }, { many: false, now: Date.now(), onUse: vi.fn(), engine: 'codex' });
    expect(tile.usageError).toBe(USAGE_UNREADABLE);
  });

  it('on the phone and the web app', () => {
    const list = [{ id: 'default', email: null, name: null, plan: 'Plus', chosen: true, signedIn: true }];
    const html = renderToStaticMarkup(React.createElement(WebAccounts, { engine: 'codex', list, reading: { value: null } as never, refusedAsk: null, onUse: vi.fn() }));
    expect(html).toContain('Not signed in');
    expect(html).not.toContain('Codex account');
  });
});
