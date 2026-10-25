// A USAGE FAILURE WE DO NOT RECOGNISE BLAMES NOBODY.
//
// Reported 2026-10-11: with an account whose subscription had ended, every
// Refresh said "Could not refresh usage. Try again.", which reads as the app
// having broken. It had not: Claude Code 2.1.293 printed no limits for that
// login at all. The founder's ask was one general sentence for every failure
// we have not named, pointing at the account rather than at our system. Named
// causes (an ended subscription, an admin's block) keep their own sentences.

import { describe, it, expect } from 'vitest';
import { ClaudeUsage } from '../main/claude-usage.mjs';
import { USAGE_UNREADABLE } from '../shared/usage.mjs';
import { accountSentence } from '../shared/spawn-trouble.mjs';

// What `claude -p /usage` printed for the lapsed login, minus the breakdown.
const NO_LIMITS = "You are currently using your subscription to power your Claude Code usage\n\nWhat's contributing to your limits usage?\n";
const LIMITS = JSON.stringify({ rate_limits_available: true, rate_limits: { five_hour: { utilization: 32, resets_at: '2026-10-12T01:00:00Z' } } });

const usage = (run) => new ClaudeUsage({ bin: () => '/bin/claude', run, where: () => '/tmp' });
const answers = (err, stdout) => (_bin, _args, _opts, done) => done(err, stdout);

describe('the general sentence', () => {
  it('points at the account and never says the app failed', () => {
    expect(USAGE_UNREADABLE).toMatch(/this account/i);
    expect(USAGE_UNREADABLE).toMatch(/claude\.ai/i);
    expect(USAGE_UNREADABLE).not.toMatch(/could not|couldn't|failed|error|try again/i);
  });
});

describe('a refresh that gets nothing it can read', () => {
  it('says the general sentence when Claude Code prints no limits', async () => {
    expect(await usage(answers(null, NO_LIMITS)).refreshNow()).toEqual({ ok: false, error: USAGE_UNREADABLE });
  });

  it('says the same when Claude Code itself fails or is missing', async () => {
    expect((await usage(answers(new Error('exit 1'), '')).refreshNow()).error).toBe(USAGE_UNREADABLE);
    expect((await new ClaudeUsage({ bin: () => null }).refreshNow()).error).toBe(USAGE_UNREADABLE);
  });

  it('still reads real limits as a reading, not an error', async () => {
    const out = await usage(answers(null, LIMITS)).refreshNow();
    expect(out.ok).toBe(true);
    expect(out.error).toBeUndefined();
  });
});

describe('an account that will not run for a reason we cannot name', () => {
  it('points at the account too, not at the app', () => {
    const s = accountSentence('unknown', null);
    expect(s).not.toMatch(/dying|crash|failed|error/i);
    expect(s).toMatch(/claude\.ai/i);
  });

  it('leaves the named causes their own words', () => {
    expect(accountSentence('subscription-ended', null)).toMatch(/subscription has ended/i);
    expect(accountSentence('org-blocked', null)).toMatch(/admin/i);
  });
});
