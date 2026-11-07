// THE PRODUCT LOOP CAN SPEND A CLAUDE CODE PLAN (w-e4d49a1539).
//
// On 2026-11-03 the person asked for the phone testers to run on a Claude Code
// plan instead of Codex. The workday could start Claude testers, but only on
// whatever login its own environment carried, with any inherited
// ANTHROPIC_API_KEY passed straight through, and the pacer read only Codex's
// session logs, so a Claude day ran unpaced for its whole --hours. Now a tester
// runs on the login named by --claude-home with the app's billing scrub, and
// the pacer reads that login's week the way the app's usage meter does.
// Claude reports several weeks (all models, Opus, Sonnet); the fullest one is
// the one that runs out first, so that is the one paced.

import { describe, expect, it } from 'vitest';
import { claudeProfile, paceFor, readClaudeLimits, readingFromLimits } from '../.claude/skills/product-loop/scripts/pace.mjs';
import { testerEnv } from '../.claude/skills/product-loop/scripts/workday.mjs';

const HOUR = 3600_000;
const now = Date.parse('2026-11-03T12:00:00Z');

describe('which of Claude\'s weeks is paced', () => {
  it('the fullest one, because it runs out first', () => {
    const reading = readingFromLimits([
      { span: 'session', percent: 20, resetsAt: now + HOUR },
      { span: 'week', qualifier: 'all models', percent: 40, resetsAt: now + 48 * HOUR },
      { span: 'week', qualifier: 'Opus', percent: 70, resetsAt: now + 48 * HOUR },
      { span: 'week', qualifier: 'Sonnet', percent: 10, resetsAt: now + 48 * HOUR },
    ]);
    expect(reading.week.percent).toBe(70);
    expect(reading.session.percent).toBe(20);
  });

  it('the only one, when there is one, as with Codex', () => {
    expect(readingFromLimits([{ span: 'week', percent: 33, resetsAt: now + HOUR }]).week.percent).toBe(33);
  });
});

describe('a Claude day with no reading', () => {
  it('stops rather than running unpaced for its whole --hours', () => {
    expect(paceFor(null, { now, needsReading: true }).verdict).toBe('stop');
  });

  it('still runs one stretch on Codex, which writes its own reading', () => {
    expect(paceFor(null, { now }).verdict).toBe('run');
  });
});

describe('whose Claude login is read', () => {
  it('~/.claude and an empty name are the default login', () => {
    expect(claudeProfile('/h/.claude', '/h')).toBe('default');
    expect(claudeProfile('', '/h')).toBe('default');
    expect(claudeProfile('default', '/h')).toBe('default');
  });

  it('any other folder is a login of its own', () => {
    expect(claudeProfile('/h/.claude-2', '/h')).toBe('/h/.claude-2');
    expect(claudeProfile('~/.claude-work', '/h')).toBe('/h/.claude-work');
  });

  it('asks that login, through Claude Code, with no API key in reach', async () => {
    let seen = null;
    const run = (bin, args, opts, done) => {
      seen = { bin, args, env: opts.env };
      done(null, JSON.stringify({ rate_limits_available: true, rate_limits: {
        five_hour: { utilization: 12, resets_at: new Date(now + HOUR).toISOString() },
        seven_day: { utilization: 41, resets_at: new Date(now + 48 * HOUR).toISOString() },
      } }));
    };
    const limits = await readClaudeLimits('/h/.claude-2', { run, env: { PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'sk-x', CLAUDE_CODE_OAUTH_TOKEN: 't' }, now });
    expect(seen.env.CLAUDE_CONFIG_DIR).toBe('/h/.claude-2');
    expect(seen.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(seen.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(seen.args).toContain('--settings');
    expect(readingFromLimits(limits).week.percent).toBe(41);
  });

  it('answers null when Claude Code cannot say', async () => {
    const run = (bin, args, opts, done) => done(new Error('signed out'), '');
    expect(await readClaudeLimits('default', { run, env: {} })).toBeNull();
  });
});

describe('the environment a tester starts in', () => {
  const inherited = { PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'sk-x', ANTHROPIC_BASE_URL: 'x', CLAUDE_CODE_OAUTH_TOKEN: 't', CLAUDECODE: '1', CLAUDE_CONFIG_DIR: '/h/.claude-work', CLAUDE_SECURESTORAGE_CONFIG_DIR: '/h/.claude-work' };

  it('a Claude tester runs on the named login, never on an API key', () => {
    const env = testerEnv('claude', inherited, { claudeHome: '/h/.claude-2' });
    expect(env.CLAUDE_CONFIG_DIR).toBe('/h/.claude-2');
    for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDECODE', 'CLAUDE_SECURESTORAGE_CONFIG_DIR']) expect(env[key]).toBeUndefined();
    expect(env.PATH).toBe('/bin');
  });

  it('the default login drops an inherited CLAUDE_CONFIG_DIR rather than spending another login', () => {
    expect(testerEnv('claude', inherited, { claudeHome: 'default' }).CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it('a Codex tester runs on the named Codex login, as before', () => {
    expect(testerEnv('codex', { PATH: '/bin' }, { codexHome: '/h/.codex-2' })).toEqual({ PATH: '/bin', CODEX_HOME: '/h/.codex-2' });
  });
});
