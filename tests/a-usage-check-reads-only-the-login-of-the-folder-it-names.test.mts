// A USAGE CHECK READS ONLY THE LOGIN OF THE FOLDER IT NAMES.
//
// What broke (2026-10-30, a screenshot of Settings › Claude Code): a second
// account's card read 45% session, 59% week, resets Sun 1pm, which were the
// account in use's numbers to the percent. Asked directly a minute either
// side, the second account was at 39% and 6-7%, resetting Thu Nov 5, and the
// cloud's own look agreed.
//
// How it can happen, read out of Claude Code 2.1.314 itself: the keychain
// entry a run signs in with is named after CLAUDE_SECURESTORAGE_CONFIG_DIR
// whenever that variable is set, even to an empty string (which means the
// default login), and only otherwise after CLAUDE_CONFIG_DIR. Claude Code
// hands the variable on to the sessions it starts. The app cleared
// CLAUDE_CONFIG_DIR and set it per account, but passed this one straight
// through, so an app started from inside a Claude Code session read one login
// for every account it checked, and started every agent on that login too.
//
// The fix: a usage check runs with only the variables it needs, named one by
// one, so no variable we have not heard of can choose its login; and every
// worker's clear-list takes the variable out.
import { describe, it, expect } from 'vitest';
import { ClaudeUsage, usageEnv } from '../main/claude-usage.mts';
import { harnessFor } from '../main/harnesses.mts';
import { terminalEnv } from '../main/task-terminals.mts';

const OUT = JSON.stringify({ rate_limits_available: true, rate_limits: { five_hour: { utilization: 39 }, seven_day: { utilization: 6 } } });

function reader(account) {
  const calls = [];
  const usage = new ClaudeUsage({
    bin: () => '/somewhere/claude',
    account,
    run: (_b, _a, opts, cb) => { calls.push(opts); cb(null, OUT); },
    now: () => 1_000,
    where: () => '/tmp/x',
  });
  return { usage, calls };
}

const inherited = {
  PATH: '/usr/bin:/bin', HOME: '/h', USER: 'me', LOGNAME: 'me', SHELL: '/bin/zsh', TMPDIR: '/tmp/me',
  LANG: 'en_US.UTF-8', HTTPS_PROXY: 'http://proxy:8080', NODE_EXTRA_CA_CERTS: '/h/ca.pem',
  CLAUDE_SECURESTORAGE_CONFIG_DIR: '/h/.claude-9', CLAUDE_CONFIG_DIR: '/h/.claude-9',
};

describe('the environment a usage check runs in', () => {
  it('the reported case: an inherited login folder does not choose the login', async () => {
    const { usage, calls } = reader(() => ({ profile: '/h/.claude-3', env: inherited }));
    await usage.refreshNow();
    expect(calls[0].env.CLAUDE_CONFIG_DIR).toBe('/h/.claude-3');
    expect(calls[0].env).not.toHaveProperty('CLAUDE_SECURESTORAGE_CONFIG_DIR');
  });

  it('an empty one is taken out too, since Claude Code reads empty as the default login', () => {
    expect(usageEnv({ ...inherited, CLAUDE_SECURESTORAGE_CONFIG_DIR: '' }, '/h/.claude-3')).not.toHaveProperty('CLAUDE_SECURESTORAGE_CONFIG_DIR');
  });

  it('the default login runs with no login folder named at all', () => {
    const env = usageEnv(inherited, 'default');
    expect(env).not.toHaveProperty('CLAUDE_CONFIG_DIR');
    expect(env).not.toHaveProperty('CLAUDE_SECURESTORAGE_CONFIG_DIR');
  });

  it('keeps what a check needs: where programs are, whose keychain, the network and the language', () => {
    expect(usageEnv(inherited, '/h/.claude-3')).toEqual({
      PATH: '/usr/bin:/bin', HOME: '/h', USER: 'me', LOGNAME: 'me', SHELL: '/bin/zsh', TMPDIR: '/tmp/me',
      LANG: 'en_US.UTF-8', HTTPS_PROXY: 'http://proxy:8080', NODE_EXTRA_CA_CERTS: '/h/ca.pem',
      CLAUDE_CONFIG_DIR: '/h/.claude-3',
    });
  });

  it('must NOT carry a variable it was not told about, whatever it is called', () => {
    const env = usageEnv({ ...inherited, SOME_FUTURE_LOGIN_DIR: '/h/.claude-9', ANTHROPIC_PROFILE: 'work', CLAUDE_BRIDGE_OAUTH_TOKEN: 't' }, '/h/.claude-3');
    expect(Object.keys(env)).not.toEqual(expect.arrayContaining(['SOME_FUTURE_LOGIN_DIR']));
    expect(env).not.toHaveProperty('ANTHROPIC_PROFILE');
    expect(env).not.toHaveProperty('CLAUDE_BRIDGE_OAUTH_TOKEN');
  });

  it('must NOT read the default login when it cannot tell whose account to read', async () => {
    const { usage, calls } = reader(() => { throw new Error('no settings yet'); });
    const result = await usage.refreshNow();
    expect(calls).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(usage.peek()).toBeNull();
  });
});

describe('the environment an agent runs in', () => {
  for (const engine of ['claude', 'codex', 'opencode']) {
    it(`${engine}: the inherited login folder is cleared, set or empty`, () => {
      const harness = harnessFor(engine);
      expect(harness.workerEnv({ PATH: '/bin', CLAUDE_SECURESTORAGE_CONFIG_DIR: '/h/.claude-9' })).toEqual({ PATH: '/bin' });
      expect(harness.workerEnv({ PATH: '/bin', CLAUDE_SECURESTORAGE_CONFIG_DIR: '' })).toEqual({ PATH: '/bin' });
    });
  }
});

describe('the terminal Add account signs in from', () => {
  it('must NOT save a new sign-in into another account’s keychain slot', () => {
    const env = terminalEnv({ PATH: '/bin', CLAUDE_SECURESTORAGE_CONFIG_DIR: '/h/.claude-9' });
    expect(env).not.toHaveProperty('CLAUDE_SECURESTORAGE_CONFIG_DIR');
    expect(env.PATH).toBe('/bin');
  });
});
