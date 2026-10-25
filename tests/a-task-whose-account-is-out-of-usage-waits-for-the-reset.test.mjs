// A TASK WHOSE ACCOUNT IS OUT OF USAGE WAITS FOR THE RESET, AND IS TOLD WHEN.
//
// Two threads, and the second one reversed the first. w-ca48e69535 found that
// a Codex login's weekly limit was read as a thirty-minute one, so a capped
// account was handed the next run again and again; it fixed that by reading
// the day Codex names AND by moving the work to a login with room.
//
// w-dac993a554 took the AUTOMATIC moving out: the app does not pick another
// account for a person. Switching to another plan yourself is allowed and
// takes effect at once (tests/switching-to-your-other-plan-at-a-limit-is-allowed).
// So the first two faults stay fixed and the third is now the rule:
//
//   1. A run that hits the limit after two minutes is not a "fast exit", so the
//      account was never marked, and the normal branch CLEARED its trouble.
//   2. Codex names a day, not an hour, so even a marked account would have come
//      back every thirty minutes for days.
//   3. The account is benched until the hour it named, nothing else is reached
//      for, and the chat stays where it is.
import { describe, it, expect } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';
import { limitResetMoment, troubleCause } from '../shared/spawn-trouble.mjs';

// The line Codex prints, copied off a real run log.
const CODEX_LIMIT = "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Sep 28th, 2026 1:05 PM.";

const FIRST = 'default';
const SECOND = '/Users/her/.codex-2';

function bare(config = {}) {
  const s = Object.create(Supervisor.prototype);
  s.config = { authProfiles: ['default'], codexProfiles: [FIRST, SECOND], maxConcurrentSessions: 3, ...config };
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._saveState = () => {};
  return s;
}

// The same wording with a reset that is always ahead of the clock. The runs
// below are dated `Date.now()`, so the copied line above went stale at 1:05pm
// on 2026-09-28: past that moment the account is no longer capped and four
// assertions flipped on every machine (found on w-3fc39983be). The parsing
// test keeps the real line and its own fixed `from`.
const LIVE_LIMIT = CODEX_LIMIT.replace('2026', String(new Date().getFullYear() + 1));

const cappedAfterTwoMinutes = (profile = FIRST) => ({
  engine: 'codex',
  profile,
  startedAt: Date.now() - 118_800,
  result: LIVE_LIMIT,
  resultIsError: true,
  tail: [`stderr: usageLimitExceeded: ${LIVE_LIMIT}`],
});

describe('a limit is read as a limit', () => {
  it('is classified as one', () => {
    expect(troubleCause(CODEX_LIMIT)).toBe('at-limit');
  });

  it('waits until the day Codex names, not thirty minutes', () => {
    const from = new Date(2026, 8, 24, 14, 10).getTime();
    expect(limitResetMoment(CODEX_LIMIT, from)).toBe(new Date(2026, 8, 28, 13, 5).getTime());
  });

  it('still reads the hour-only wording', () => {
    const from = new Date(2026, 8, 24, 14, 10).getTime();
    expect(limitResetMoment("You've hit your limit · resets 6pm", from)).toBe(new Date(2026, 8, 24, 18, 0).getTime());
  });
});

describe('a run that hits the limit late marks its account', () => {
  it('marks the codex login, until the reset, and not her claude one', () => {
    const s = bare();
    s.noteExitForBackoff(cappedAfterTwoMinutes());
    expect(s._profileTrouble['codex:default']?.cause).toBe('at-limit');
    expect(s._profileCooldown['codex:default']).toBeGreaterThan(new Date(2026, 8, 28, 13, 0).getTime());
    expect(s._profileTrouble.default).toBeUndefined();
    expect(s._profileCooldown.default ?? 0).toBe(0);
  });

  // THE CAPPED LOGIN IS STILL THE ACCOUNT, and nothing runs on it until the
  // reset: the second login is not reached for (w-dac993a554).
  it('keeps new work out of the capped login rather than moving it', () => {
    const s = bare();
    s.noteExitForBackoff(cappedAfterTwoMinutes());
    expect(s._liveProfilesFor('codex')).toEqual([]);
    const picked = new Set();
    for (let i = 0; i < 10; i += 1) picked.add(s._pickProfile('codex'));
    expect([...picked]).toEqual([FIRST]);
  });

  // The branch this reuses must not swallow ordinary work: a long run that
  // ends cleanly still clears whatever was on its account.
  it('still clears an account when a long run ends normally', () => {
    const s = bare();
    s._profileTrouble['codex:default'] = { cause: 'unknown', since: 1, at: 1 };
    s.noteExitForBackoff({ engine: 'codex', profile: FIRST, startedAt: Date.now() - 600_000, result: 'done', resultIsError: false, tail: [] });
    expect(s._profileTrouble['codex:default']).toBeUndefined();
  });
});

describe('the chat stays on the account that is out of usage', () => {
  it('keeps a capped codex chat where it is, second login or no second login', () => {
    const s = bare();
    s.noteExitForBackoff(cappedAfterTwoMinutes());
    expect(s._profileCannotHoldAChat(FIRST, 'codex')).toBe(false);
  });

  // HER OWN HAND IS STILL HER OWN HAND. Picking the other account in Settings
  // is a person choosing between two plans they hold, not the app reaching for
  // one, so a chat left on the account nothing runs on now does move.
  it('moves a chat off an account she has switched away from', () => {
    const s = bare({ activeAccount: { codex: SECOND } });
    s.noteExitForBackoff(cappedAfterTwoMinutes());
    expect(s._pickProfile('codex')).toBe(SECOND);
    expect(s._profileCannotHoldAChat(SECOND, 'codex')).toBe(false);
  });

  it('keeps the chat when the capped login is the only one', () => {
    const s = bare({ codexProfiles: [FIRST] });
    s.noteExitForBackoff(cappedAfterTwoMinutes());
    expect(s._profileCannotHoldAChat(FIRST, 'codex')).toBe(false);
  });

  it('keeps the chat when every login is capped', () => {
    const s = bare();
    s.noteExitForBackoff(cappedAfterTwoMinutes(FIRST));
    s.noteExitForBackoff(cappedAfterTwoMinutes(SECOND));
    expect(s._profileCannotHoldAChat(FIRST, 'codex')).toBe(false);
  });

  // WHERE HER REPLY GOES: back to the same session on the same account, which
  // is where the transcript is. It waits for the reset rather than being
  // briefed fresh somewhere else.
  it('sends her reply back to the same session on the capped login', () => {
    const s = bare();
    s._rowSessions = { 'w-1': { sessionId: 't-1', product: 'p', profile: FIRST, engine: 'codex' } };
    s._engineFor = () => 'codex';
    s.transcriptFile = () => '/somewhere/rollout.jsonl';
    const item = { id: 'w-1', product: 'p' };
    expect(s.rowSessionFor(item)).not.toBeNull();
    s.noteExitForBackoff(cappedAfterTwoMinutes());
    expect(s.rowSessionFor(item)).not.toBeNull();
  });

  // THE CASE THAT MUST NOT MATCH: a Codex cap is not a fact about Claude Code,
  // and the engines stay apart however this is answered.
  it('leaves the other engine alone', () => {
    const s = bare({ authProfiles: ['default', '/Users/her/.claude-second'] });
    s.noteExitForBackoff({ engine: 'claude', profile: 'default', startedAt: Date.now() - 300_000, result: "You've hit your limit · resets 6pm", resultIsError: true, tail: [] });
    expect(s._profileTrouble.default?.cause).toBe('at-limit');
    expect(s._profileTrouble['codex:default']).toBeUndefined();
    expect(s._profileCannotHoldAChat('default', 'claude')).toBe(false);
  });
});
