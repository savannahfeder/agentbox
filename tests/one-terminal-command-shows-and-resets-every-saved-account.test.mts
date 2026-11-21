// ONE TERMINAL COMMAND SHOWS AND RESETS EVERY SAVED ACCOUNT.
//
// What broke (2026-11-20): saved accounts kept going wrong in new ways (a
// renamed plan shown by its old name, a fresh /login still shown as signed
// out), and each time the only way to see the truth was an agent reading
// Claude Code's files by hand. `npm run accounts` now asks each engine's own
// status command about every login folder and sets that beside what Agentbox
// holds, without the app's screen; `--reset` makes the app forget what it
// holds, whether or not the app is running. Measured here on a laid-out home
// with fake status commands, and on a Supervisor taking the request.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLogins, describeLogins, disagrees, resetAccounts } from '../main/accounts-command.mts';
import { accountRecheckFile, askForAccountRecheck, takeAccountRecheck } from '../main/account-recheck.mts';
import { readAnswer } from '../main/ask-the-engine.mts';
import { Supervisor } from '../main/supervisor.mts';
import { KeychainStamps } from '../main/sign-in-files.mts';

let root: string;
let home: string;
let store: string;
const NOW = 1_800_000_000_000;

const login = (file: string, email: string, uuid: string, extra: Record<string, unknown> = {}) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ oauthAccount: { accountUuid: uuid, emailAddress: email, organizationRateLimitTier: 'default_claude_max_20x', billingType: 'stripe_subscription', ...extra } }));
};
const IN = (email: string) => readAnswer('claude', 0, JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email, subscriptionType: 'max', planTier: 'max_20x' }), '');
const OUT = readAnswer('claude', 1, JSON.stringify({ loggedIn: false, authMethod: 'none' }), '');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'accounts-cmd-'));
  home = path.join(root, 'home');
  store = path.join(root, 'store');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(store);
  login(path.join(home, '.claude.json'), 'main@example.com', 'u-main', { planDisplayName: 'Ultra' });
  login(path.join(home, '.claude-2', '.claude.json'), 'second@example.com', 'u-second');
  // Used once by Claude Code, never signed in: Agentbox does not list it.
  fs.mkdirSync(path.join(home, '.claude-3'));
  fs.writeFileSync(path.join(home, '.claude-3', '.claude.json'), '{}');
  // Never a Claude Code folder at all.
  fs.mkdirSync(path.join(home, '.claude-worktrees'));
  fs.mkdirSync(path.join(home, '.codex'));
  fs.writeFileSync(path.join(home, '.codex', 'auth.json'), '{}');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const saved = (state: Record<string, unknown>) => fs.writeFileSync(path.join(store, '.zero-supervisor.json'), JSON.stringify(state));
const config = () => ({ storeRoot: store, claudeBin: '/bin/claude', codexBin: '/bin/codex', authProfiles: [], codexProfiles: [], codexHome: path.join(home, '.codex') });
const asking = (answers: Record<string, ReturnType<typeof readAnswer>>) => async (engine: string, { folder }: { folder?: string | null }) =>
  answers[`${engine}:${folder ?? 'default'}`] ?? readAnswer(engine, null, '', '');

describe('what the command reads', () => {
  it('the reported case: Claude Code says signed in, Agentbox still holds it as signed out', async () => {
    saved({ profileTrouble: { default: { cause: 'signed-out', since: NOW - 60_000 } } });
    const rows = await readLogins(config(), { home, now: NOW, ask: asking({ 'claude:default': IN('main@example.com') }) });
    const main = rows.find((r) => r.engine === 'claude' && r.key === 'default')!;
    expect(main).toMatchObject({ email: 'main@example.com', plan: 'Ultra', appHolds: { cause: 'signed-out' } });
    expect(disagrees(main)).toBe(true);
    const text = describeLogins(rows, { home });
    expect(text).toMatch(/~\/\.claude\n {4}Claude Code says: signed in as main@example\.com, Ultra\n {4}Agentbox thinks: signed out {3}<- they disagree/);
    expect(text).toMatch(/npm run accounts -- --reset/);
  });

  it('every Claude folder Claude Code has used is shown, listed or not; other folders are not', async () => {
    const rows = await readLogins(config(), { home, now: NOW, ask: asking({}) });
    const claude = rows.filter((r) => r.engine === 'claude');
    expect(claude.map((r) => path.basename(r.folder))).toEqual(['.claude', '.claude-2', '.claude-3']);
    expect(claude.find((r) => r.folder.endsWith('.claude-3'))!.key).toBeNull();
    expect(describeLogins(rows, { home })).toMatch(/~\/\.claude-3\n.*\n {4}Agentbox does not list it/);
  });

  it('a second folder holding a listed account names the folder that is listed', async () => {
    login(path.join(home, '.claude-9', '.claude.json'), 'main@example.com', 'u-main');
    const rows = await readLogins(config(), { home, now: NOW, ask: asking({}) });
    expect(rows.find((r) => r.folder.endsWith('.claude-9'))!.sameAs).toBe(path.join(home, '.claude'));
    expect(rows.find((r) => r.folder.endsWith('.claude-3'))!.sameAs).toBeNull();
    expect(describeLogins(rows, { home })).toMatch(/~\/\.claude-9\n.*\n {4}Agentbox lists this account once, as ~\/\.claude\n/);
  });

  it('an old mark reads as the Accounts page reads it: an ended plan is ended', async () => {
    login(path.join(home, '.claude-2', '.claude.json'), 'second@example.com', 'u-second', { billingType: 'none' });
    saved({ profileTrouble: { [path.join(home, '.claude-2')]: { cause: 'unknown', since: NOW - 60_000 } } });
    const rows = await readLogins({ ...config(), authProfiles: [path.join(home, '.claude-2')] }, { home, now: NOW, ask: asking({}) });
    expect(rows.find((r) => r.folder.endsWith('.claude-2'))!.appHolds!.cause).toBe('subscription-ended');
  });

  it('each folder is asked as itself, and the default with no folder named', async () => {
    const asked: (string | null | undefined)[] = [];
    await readLogins(config(), { home, now: NOW, ask: async (engine, { folder }) => { if (engine === 'claude') asked.push(folder); return OUT; } });
    expect(asked).toEqual([null, path.join(home, '.claude-2'), path.join(home, '.claude-3')]);
  });

  it('a signed-out login shows no plan, and Agentbox being fine says so', async () => {
    const rows = await readLogins(config(), { home, now: NOW, ask: asking({ 'claude:default': OUT }) });
    expect(describeLogins(rows, { home })).toMatch(/~\/\.claude\n {4}Claude Code says: signed out\n {4}Agentbox thinks: fine/);
    expect(describeLogins(rows, { home })).not.toMatch(/--reset/);
  });

  it('Codex logins are read from their own homes, under their own key', async () => {
    saved({ profileTrouble: { 'codex:default': { cause: 'at-limit', resetsAt: NOW + 3_600_000 } } });
    const rows = await readLogins(config(), { home, now: NOW, ask: asking({ [`codex:${path.join(home, '.codex')}`]: readAnswer('codex', 0, 'Logged in using ChatGPT', '') }) });
    const codex = rows.filter((r) => r.engine === 'codex');
    expect(codex).toHaveLength(1);
    expect(codex[0]).toMatchObject({ key: 'codex:default', engineSays: { signedIn: true }, appHolds: { cause: 'at-limit' } });
  });

  it('with no engine program, each row says no answer rather than guessing', async () => {
    const rows = await readLogins({ ...config(), claudeBin: null, codexBin: null }, { home, now: NOW });
    expect(rows.every((r) => r.engineSays === null)).toBe(true);
    expect(describeLogins(rows, { home })).toMatch(/Claude Code says: no answer/);
  });

  it('a rest that has run out is not shown as held', async () => {
    saved({ profileCooldown: { default: NOW - 1 } });
    const rows = await readLogins(config(), { home, now: NOW, ask: asking({}) });
    expect(rows.find((r) => r.key === 'default')!.appHolds).toBeNull();
  });
});

describe('--reset', () => {
  const start = () => {
    const s = new Supervisor(
      { home, storeRoot: store, maxConcurrentSessions: 3, authProfiles: ['default'] },
      { listItems: () => [], listProducts: () => [] },
      '/nonexistent-app',
    );
    s._keychainStamps = new KeychainStamps((_service, done) => done(null));
    return s;
  };

  it('a request is taken once', () => {
    askForAccountRecheck(store);
    expect(takeAccountRecheck(store)).toBe(true);
    expect(takeAccountRecheck(store)).toBe(false);
    expect(takeAccountRecheck(null)).toBe(false);
  });

  it('the app forgets every mark on this computer\'s logins, and keeps the cloud\'s', () => {
    const sup = start();
    sup._noteProfileTrouble('default', 'Failed to authenticate: OAuth session expired and could not be refreshed');
    sup._strikeProfile('default', { hard: true });
    sup._noteProfileTrouble('codex:default', 'Not logged in');
    sup._profileTrouble['cloud:claude'] = { cause: 'at-limit', at: Date.now() };
    sup._spawnCooldownUntil = Date.now() + 60_000;
    sup._heldStarts = { 'w-1': { account: 'default', next: Date.now() + 3_600_000, tries: 1, since: 0 } } as never;
    expect(sup._takeAccountRecheck()).toBe(false);

    askForAccountRecheck(store);
    expect(sup._takeAccountRecheck()).toBe(true);
    expect(Object.keys(sup._profileTrouble)).toEqual(['cloud:claude']);
    expect(sup._profileResting('default')).toBe(false);
    expect(sup._spawnCooldownUntil).toBe(0);
    expect((sup._heldStarts as Record<string, { next: number }>)['w-1'].next).toBeLessThanOrEqual(Date.now());
    expect(fs.existsSync(accountRecheckFile(store))).toBe(false);
    // Saved, so a restart does not bring the marks back.
    const state = JSON.parse(fs.readFileSync(path.join(store, '.zero-supervisor.json'), 'utf8'));
    expect(Object.keys(state.profileTrouble)).toEqual(['cloud:claude']);
  });

  it('a request left while the app was closed is taken when it starts', async () => {
    askForAccountRecheck(store);
    const sup = start();
    sup.store = { listItems: () => [], listProducts: () => [] } as never;
    await sup.tick();
    expect(fs.existsSync(accountRecheckFile(store))).toBe(false);
  });

  it('a paused app still takes it', async () => {
    const sup = start();
    sup.store = { listItems: () => [], listProducts: () => [] } as never;
    sup.paused = true;
    askForAccountRecheck(store);
    await sup.tick();
    expect(fs.existsSync(accountRecheckFile(store))).toBe(false);
  });

  it('the command says whether a running app took it', async () => {
    expect(await resetAccounts(store, { waitMs: 50, poll: 10 })).toBe('waiting');
    const sup = start();
    const ticking = setInterval(() => sup._takeAccountRecheck(), 5);
    try {
      expect(await resetAccounts(store, { waitMs: 2_000, poll: 10 })).toBe('taken');
    } finally { clearInterval(ticking); }
  });
});
