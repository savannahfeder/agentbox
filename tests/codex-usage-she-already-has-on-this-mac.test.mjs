// HER CODEX USAGE, WHICH THE PANEL COULD NOT SHOW HER.
//
// It was not a bug in the sense of something broken. The app only ever learned a
// Codex figure from a push that arrives during a turn POWERUP ITSELF RAN, and she
// runs Codex in its own app, so the panel had never had anything to draw. Two
// things came out of that, and this file holds both:
//
//   1. THE FIGURE IS ON HER DISK ALREADY. Codex writes every rate-limit report it
//      receives into its own session log under CODEX_HOME. Reading it starts no
//      process and sends nothing anywhere, which is the rule main/codex-usage.mjs
//      exists to keep.
//   2. THE LABELS WERE WRONG FOR HER ACCOUNT. `primary` was taken to mean the five
//      hour window. Measured across the 1,140 records in her twenty-five most
//      recent sessions: every window is 10080 minutes and `secondary` is never
//      populated. So her WEEK was about to be drawn as a session, and the corner
//      meter, which asked for a session window and nothing else, drew nothing at
//      all on a day that week was at 100% used.

import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexLimits, windowSpan } from '../shared/codex-usage.mjs';
import { headlineLimit, sessionLimit, usageSentence } from '../shared/usage.mjs';
import { loggedCodexLimits, forgetLoggedLimits } from '../main/codex-usage-file.mjs';
import { CodexUsage } from '../main/codex-usage.mjs';

/*
 * HER OWN SHAPE, snake_case because that is how the session log spells it, and
   with the numbers read off her Mac on 2026-09-18. One window, and it is the
   week. */
const HERS = {
  limit_id: 'codex',
  limit_name: null,
  primary: { used_percent: 100.0, window_minutes: 10080, resets_at: 1790215059 },
  secondary: null,
  plan_type: 'pro',
};

/*
 * AND THE ALL-NULL ONE THAT ARRIVES BESIDE IT. Codex reports a `premium` family
   on her account with every field null; it was the LAST record in her newest log
   on the day this was written, so a reader that took the last one blindly would
   have found nothing. */
const EMPTY_FAMILY = {
  limit_id: 'premium',
  primary: null,
  secondary: null,
  credits: { has_credits: false, unlimited: false, balance: '0' },
  plan_type: 'pro',
};

const line = (rate_limits, timestamp) => `${JSON.stringify({
  timestamp,
  type: 'event_msg',
  payload: { type: 'token_count', rate_limits },
})}\n`;

function log(entries) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
  const dir = path.join(home, 'sessions', '2026', '09', '18');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'rollout-2026-09-18T17-16-47-abc.jsonl'), entries.join(''));
  return home;
}

beforeEach(() => forgetLoggedLimits());

describe('a window is named for how long it is, not for the slot it arrived in', () => {
  // THE DEFECT, STATED AS THE THING SHE WOULD HAVE READ. Her only window is seven
  // days long and it arrived as `primary`, which the reader called "This session".
  it('calls her seven day window a week, not a session', () => {
    const [limit] = codexLimits(HERS);
    expect(limit.name).toBe('This week');
    expect(limit.span).toBe('week');
    expect(limit.percent).toBe(100);
  });

  // The five hour window is still a session wherever one really exists, so the
  // ordinary account is untouched by the fix.
  it('still calls a five hour window a session', () => {
    const [limit] = codexLimits({ primary: { usedPercent: 33, windowDurationMins: 300, resetsAt: 1788573509 } });
    expect(limit.name).toBe('This session');
    expect(limit.span).toBe('session');
  });

  // BOTH SPELLINGS, because two sources feed this: the app-server pushes
  // camelCase and the session log on disk is snake_case. Same numbers either way.
  it('reads the push and the log identically', () => {
    const camel = codexLimits({ primary: { usedPercent: 100, windowDurationMins: 10080, resetsAt: 1790215059 } });
    const snake = codexLimits(HERS);
    expect(camel).toEqual(snake);
  });

  // A span nobody has a word for is named after its own length rather than
  // guessed at, because a limit under the wrong span is worse than a plain one.
  it('names an unfamiliar window after its own length', () => {
    expect(windowSpan(60 * 24 * 3)[1]).toBe('These 3 days');
    expect(windowSpan(10080)[1]).toBe('This week');
    expect(windowSpan(300)[1]).toBe('This session');
    expect(windowSpan(null)).toBe(null);
  });

  // AND THE SLOT IS STILL THE TIE-BREAKER when a payload names no duration,
  // which is the one case where there is nothing better to go on.
  it('falls back to the slot when no duration is given', () => {
    const [first, second] = codexLimits({
      primary: { usedPercent: 10 },
      secondary: { usedPercent: 20 },
    });
    expect(first.name).toBe('This session');
    expect(second.name).toBe('This week');
  });
});

describe('the corner draws the limit she actually has', () => {
  // THE SECOND HALF OF THE SAME DEFECT. The meter asked for a session window and
  // returned null without one, so fixing the label above would have emptied her
  // corner entirely. It draws the fullest window she has instead.
  it('falls back to her fullest window when there is no session one', () => {
    const limits = codexLimits(HERS);
    expect(sessionLimit(limits)).toBe(null);
    expect(headlineLimit(limits).percent).toBe(100);
    expect(headlineLimit(limits).name).toBe('This week');
  });

  // The session window still wins wherever there is one: it is the limit that
  // stops her today, whatever the week says.
  it('still prefers the session window when one exists', () => {
    const limits = codexLimits({
      primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1788573509 },
      secondary: { usedPercent: 99, windowDurationMins: 10080, resetsAt: 1788798916 },
    });
    expect(headlineLimit(limits).name).toBe('This session');
  });

  // An empty corner is still the honest answer when there is genuinely nothing.
  it('draws nothing when there is nothing', () => {
    expect(headlineLimit([])).toBe(null);
    expect(headlineLimit(null)).toBe(null);
  });
});

describe('the figure Codex already wrote down on this Mac', () => {
  it('reads the last usable report out of the newest session log', () => {
    const home = log([line(HERS, '2026-09-18T20:50:53.678Z')]);
    const reading = loggedCodexLimits(home);
    expect(codexLimits(reading.snapshot)[0].percent).toBe(100);
    expect(reading.at).toBe(Date.parse('2026-09-18T20:50:53.678Z'));
  });

  // THE ALL-NULL FAMILY IS SKIPPED, NOT ACCEPTED. It was the last record in her
  // real log, so a reader that took the newest line blindly would have answered
  // "nothing here" over a figure sitting one line above it.
  it('walks back past a report with no usable window', () => {
    const home = log([
      line(HERS, '2026-09-18T20:50:53.678Z'),
      line(EMPTY_FAMILY, '2026-09-18T21:10:00.000Z'),
    ]);
    expect(codexLimits(loggedCodexLimits(home).snapshot)[0].percent).toBe(100);
  });

  // A Mac where Codex has never run has no log and no answer, and that is
  // ordinary rather than a failure.
  it('answers null where Codex has never run', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-empty-'));
    expect(loggedCodexLimits(home)).toBe(null);
    expect(loggedCodexLimits(null)).toBe(null);
  });

  // A LOG NOBODY HAS TOUCHED IN A FORTNIGHT IS NOT AN ANSWER. A stale percentage
  // is worse than no percentage.
  it('ignores a log that is months old', () => {
    const home = log([line(HERS, '2026-09-18T20:50:53.678Z')]);
    const file = path.join(home, 'sessions', '2026', '09', '18', 'rollout-2026-09-18T17-16-47-abc.jsonl');
    const old = Date.now() - (60 * 24 * 60 * 60 * 1000);
    fs.utimesSync(file, old / 1000, old / 1000);
    expect(loggedCodexLimits(home)).toBe(null);
  });
});

describe('the push still wins', () => {
  // A live notification is this second's truth and a log is the last thing
  // anybody wrote down, so nothing about the existing path changes.
  it('prefers what the app-server reported over what the log says', () => {
    const usage = new CodexUsage({
      home: () => '/codex',
      now: () => 1_700_000_000_000,
      readLog: () => ({ snapshot: HERS, at: 1 }),
    });
    usage.saw('account/rateLimits/updated', {
      rateLimits: { primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1788573509 } },
    }, '/codex');
    const reading = usage.read();
    expect(reading.limits[0].name).toBe('This session');
    expect(reading.limits[0].percent).toBe(12);
  });

  // AND THE LOG IS READ WHEN NOTHING HAS PUSHED, which is her Mac.
  it('reads the log when no push has ever arrived', () => {
    const usage = new CodexUsage({ home: () => '/codex', readLog: () => ({ snapshot: HERS, at: 42 }) });
    const reading = usage.read();
    expect(reading.limits[0].percent).toBe(100);
    expect(usageSentence(reading.limits, reading.at + 1000)).toContain('This week: 100% used');
    expect(reading.at).toBe(42);
  });

  // A reading belongs to the login that gave it, and the log lives inside the
  // home, so the home is handed in rather than guessed at here.
  it('asks the log about the home it is given', () => {
    const asked = [];
    const usage = new CodexUsage({ home: () => '/somewhere/else', readLog: (home) => { asked.push(home); return null; } });
    expect(usage.read()).toBe(null);
    expect(asked).toEqual(['/somewhere/else']);
  });
});
