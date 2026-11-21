// A LOGIN THE ENGINE SAYS IS BACK IS NOT SHOWN SIGNED OUT.
//
// What broke (2026-11-20): an account was found signed out, its owner typed
// /login in Claude Code, and Settings went on calling it signed out. The app
// only noticed a sign-in by the times on Claude Code's files and Keychain
// entry, which is a guess at how Claude Code stores a login, and the mark was
// otherwise cleared only by a run surviving on that account, which never came
// for an account nobody had picked. Measured by filing the mark on a
// Supervisor and asking it with a fake status command, below.
//
// Now the app asks the engine's own status command (`claude auth status
// --json`, `codex login status`) about a login it holds as signed out. The
// first answer after the mark is kept; a later one that differs and says
// signed in clears the mark. An answer that never changes clears nothing, so
// a login Claude Code calls signed in while its runs are refused is not tried
// over and over.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { askEngine, readAnswer, loginEnv } from '../main/ask-the-engine.mts';
import type { EngineAnswer } from '../main/ask-the-engine.mts';
import { KeychainStamps } from '../main/sign-in-files.mts';

const SIGNED_OUT = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const status = (o: Record<string, unknown>) => JSON.stringify({ apiProvider: 'firstParty', ...o }, null, 2);
const IN = status({ loggedIn: true, authMethod: 'claude.ai', email: 'a@example.com', orgId: 'o1', subscriptionType: 'max', planTier: 'max_20x', loginExpiresAt: 1000 });
const OUT = status({ loggedIn: false, authMethod: 'none', loginExpiresAt: null });

describe('reading the engine\'s answer', () => {
  it('Claude Code signed in: yes, its email and plan', () => {
    const a = readAnswer('claude', 0, IN, '');
    expect(a).toMatchObject({ signedIn: true, email: 'a@example.com', plan: 'max_20x' });
  });

  it('Claude Code signed out exits 1 and says so', () => {
    expect(readAnswer('claude', 1, OUT, '').signedIn).toBe(false);
  });

  it('a new login changes the print, the same login does not', () => {
    const again = readAnswer('claude', 0, IN, '').print;
    expect(readAnswer('claude', 0, IN, '').print).toBe(again);
    const renewed = IN.replace('"loginExpiresAt": 1000', '"loginExpiresAt": 2000');
    expect(readAnswer('claude', 0, renewed, '').print).not.toBe(again);
  });

  it('output in a shape nobody here has seen still answers by its exit code', () => {
    expect(readAnswer('claude', 0, 'Signed in as someone', '')).toMatchObject({ signedIn: true, email: null });
    expect(readAnswer('claude', 1, 'Not logged in', '').signedIn).toBe(false);
  });

  it('Codex answers in a line', () => {
    expect(readAnswer('codex', 0, 'Logged in using ChatGPT\n', '')).toMatchObject({ signedIn: true, said: 'Logged in using ChatGPT' });
    expect(readAnswer('codex', 1, '', 'Not logged in\n').signedIn).toBe(false);
  });

  it('no exit code is no answer, and has no print', () => {
    const a = readAnswer('claude', null, '', '');
    expect(a.signedIn).toBeNull();
    expect(a.print).toBeNull();
  });
});

describe('asking', () => {
  it('runs the status command on that login, with no API key from the shell', async () => {
    let seen: { file: string; args: string[]; env: NodeJS.ProcessEnv } | null = null;
    const answer = await askEngine('claude', {
      bin: '/bin/claude', folder: '/h/.claude-second', base: { PATH: '/bin', ANTHROPIC_API_KEY: 'k', CLAUDE_CONFIG_DIR: '/elsewhere' },
      run: (file, args, { env }, done) => { seen = { file, args, env }; done(null, IN, ''); },
    });
    expect(answer.signedIn).toBe(true);
    expect(seen!.file).toBe('/bin/claude');
    expect(seen!.args).toEqual(['auth', 'status', '--json']);
    expect(seen!.env.CLAUDE_CONFIG_DIR).toBe('/h/.claude-second');
    expect(seen!.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('the default Claude login runs with no config folder named', () => {
    expect(loginEnv('claude', null, '/bin/claude', { PATH: '/bin', CLAUDE_CONFIG_DIR: '/x' }).CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it('a Codex login runs in its own CODEX_HOME', () => {
    expect(loginEnv('codex', '/h/.codex-2', '/bin/codex', { PATH: '/bin', CODEX_HOME: '/x' }).CODEX_HOME).toBe('/h/.codex-2');
  });

  it('a missing program or a timeout is no answer, not an error', async () => {
    const gone = await askEngine('claude', { bin: '/nowhere/claude', run: (_f, _a, _o, done) => done(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }), '', '') });
    expect(gone.signedIn).toBeNull();
    expect(gone.said).toMatch(/ENOENT/);
    const slow = await askEngine('claude', { bin: '/bin/claude', run: (_f, _a, _o, done) => done(Object.assign(new Error('killed'), { code: null }), '', '') });
    expect(slow.signedIn).toBeNull();
  });

  it('passes a deadline that ends the check', async () => {
    let timeout = 0;
    await askEngine('codex', { bin: '/bin/codex', run: (_f, _a, o, done) => { timeout = o.timeout; done(null, 'Logged in', ''); } });
    expect(timeout).toBeGreaterThan(0);
  });
});

describe('the app asks about a login it holds as signed out', () => {
  let root: string;
  let home: string;
  let sup: Supervisor;
  let answers: Record<string, EngineAnswer>;
  let asked: { engine: string; folder: string | null | undefined }[];

  const answer = (engine: string, exit: number, out: string) => readAnswer(engine, exit, out, '');
  const start = (extra: Record<string, unknown> = {}) => {
    const s = new Supervisor(
      { home, storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default'], claudeBin: '/bin/claude', codexBin: '/bin/codex', ...extra },
      { listItems: () => [], listProducts: () => [] },
      '/nonexistent-app',
    );
    s._keychainStamps = new KeychainStamps((_service, done) => done(null));
    s._askEngine = async (engine: string, { folder }: { folder?: string | null }) => {
      asked.push({ engine, folder });
      return answers[engine === 'codex' ? `codex:${folder}` : folder ?? 'default'];
    };
    return s;
  };
  const markSignedOut = (key = 'default') => {
    sup._noteProfileTrouble(key, SIGNED_OUT);
    sup._strikeProfile(key, { hard: true });
  };
  const askNow = async (at = Date.now()) => { await sup._askAboutSignedOutLogins(at); };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-engine-'));
    home = path.join(root, 'home');
    fs.mkdirSync(home);
    answers = {};
    asked = [];
    sup = start();
  });
  afterEach(() => {
    try { sup.stop?.(); } catch { /* not started */ }
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('the reported case: signed out, then /login, and the mark goes', async () => {
    markSignedOut();
    answers.default = answer('claude', 1, OUT);
    await askNow(1_000);
    expect(sup._profileTrouble.default?.cause).toBe('signed-out');
    answers.default = answer('claude', 0, IN);
    await askNow(1_000 + 10 * 60_000);
    expect(sup._profileTrouble.default).toBeUndefined();
    expect(sup._profileResting('default')).toBe(false);
  });

  it('an answer that never changes clears nothing, even when it says signed in', async () => {
    markSignedOut();
    answers.default = answer('claude', 0, IN);
    await askNow(1_000);
    await askNow(1_000 + 10 * 60_000);
    await askNow(1_000 + 20 * 60_000);
    expect(sup._profileTrouble.default?.cause).toBe('signed-out');
  });

  it('a fresh /login on a login it already called signed in still counts', async () => {
    markSignedOut();
    answers.default = answer('claude', 0, IN);
    await askNow(1_000);
    answers.default = answer('claude', 0, IN.replace('"loginExpiresAt": 1000', '"loginExpiresAt": 5000'));
    await askNow(1_000 + 10 * 60_000);
    expect(sup._profileTrouble.default).toBeUndefined();
  });

  it('a later death keeps the first answer, so a sign-in between them is not missed', async () => {
    markSignedOut();
    answers.default = answer('claude', 1, OUT);
    await askNow(1_000);
    markSignedOut();
    answers.default = answer('claude', 0, IN);
    await askNow(1_000 + 10 * 60_000);
    expect(sup._profileTrouble.default).toBeUndefined();
  });

  it('no answer keeps the mark and the first answer', async () => {
    markSignedOut();
    answers.default = answer('claude', 1, OUT);
    await askNow(1_000);
    answers.default = answer('claude', null as unknown as number, '');
    await askNow(1_000 + 10 * 60_000);
    expect(sup._profileTrouble.default?.cause).toBe('signed-out');
  });

  it('asks at most every few minutes per login', async () => {
    markSignedOut();
    answers.default = answer('claude', 1, OUT);
    await askNow(1_000);
    await askNow(1_000 + 30_000);
    expect(asked).toHaveLength(1);
  });

  it('a second Claude folder and a Codex home are each asked as themselves', async () => {
    const second = path.join(home, '.claude-second');
    const codexHome = path.join(home, '.codex');
    sup._codexProfileHome = () => codexHome;
    markSignedOut(second);
    markSignedOut('codex:default');
    answers[second] = answer('claude', 1, OUT);
    answers[`codex:${codexHome}`] = answer('codex', 1, 'Not logged in');
    await askNow(1_000);
    expect(asked).toEqual(expect.arrayContaining([{ engine: 'claude', folder: second }, { engine: 'codex', folder: codexHome }]));
    answers[`codex:${codexHome}`] = answer('codex', 0, 'Logged in using ChatGPT');
    await askNow(1_000 + 10 * 60_000);
    expect(sup._profileTrouble['codex:default']).toBeUndefined();
    expect(sup._profileTrouble[second]?.cause).toBe('signed-out');
  });

  it('must NOT ask about other trouble, which a sign-in cannot fix', async () => {
    sup._noteProfileTrouble('default', 'Your organization has disabled Claude subscription access for Claude Code');
    await askNow(1_000);
    expect(asked).toEqual([]);
  });

  it('with no engine program known, nothing is asked', async () => {
    sup = start({ claudeBin: null });
    markSignedOut();
    await askNow(1_000);
    expect(asked).toEqual([]);
  });

  it('a held thread on that login gets its next try now', async () => {
    markSignedOut();
    sup._heldStarts = { 'w-1': { account: 'default', next: Date.now() + 60 * 60_000, tries: 1, since: 0 } } as never;
    answers.default = answer('claude', 1, OUT);
    await askNow(1_000);
    answers.default = answer('claude', 0, IN);
    await askNow(1_000 + 10 * 60_000);
    expect((sup._heldStarts as Record<string, { next: number }>)['w-1'].next).toBeLessThanOrEqual(Date.now());
  });
});
