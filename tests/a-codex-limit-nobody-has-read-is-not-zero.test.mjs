// A CODEX LIMIT NOBODY HAS READ IS NOT ZERO.
//
// The dashboard law, applied to the corner: absence of data and a real zero are
// different facts and must never look the same, and a number not read yet is a
// third fact.
//
// THIS IS NOT A THEORETICAL CASE. It is in the protocol. Measured on this Mac
// 2026-09-05 off `codex app-server generate-json-schema --out`, codex-cli
// 0.148.0: in `RateLimitSnapshot` BOTH `primary` and `secondary` are
// `anyOf [RateLimitWindow, null]`, and the whole object has no required field at
// all. And the live `account/rateLimits/read` on this Mac returned a bucket with
// exactly that shape -- `base_model_inference` came back
// `{"primary":{...},"secondary":null}`. A window that is not there is ordinary.
//
// WHAT THE READING REALLY LOOKS LIKE, verbatim off this Mac 2026-09-05 at
// now(s)=1788565827, `account/rateLimits/read` on a real app-server:
//
//   "rateLimits": { "limitId": "codex", "limitName": null,
//     "primary":   { "usedPercent": 33, "windowDurationMins": 300,   "resetsAt": 1788573509 },
//     "secondary": { "usedPercent": 63, "windowDurationMins": 10080, "resetsAt": 1788798916 } }
//
// `resetsAt` IS UNIX SECONDS AND THAT IS MEASURED, NOT ASSUMED. Two independent
// proofs off that same capture: the weekly window's reset minus the moment it
// was taken is 604800 exactly, which is 10080 minutes to the second and is the
// `windowDurationMins` beside it; and the schema's neighbouring
// `RateLimitResetCredit.expiresAt` is documented "Unix timestamp in seconds".
// Read as milliseconds every reset would land in the year 58,000. It is
// multiplied by 1000 once, here, and nowhere else.
//
// AND `account/rateLimits/updated` IS A SPARSE ROLLING UPDATE, which is the
// trap in this file.

import { describe, expect, it } from 'vitest';
import { codexLimits, mergeRateLimits } from '../shared/codex-usage.mjs';
import { limitRows, sessionLimit, usageSentence } from '../shared/usage.mjs';

// Verbatim off this Mac, 2026-09-05. `now` is the second it was taken.
const NOW = 1788565827 * 1000;
const HERS = {
  limitId: 'codex',
  limitName: null,
  primary: { usedPercent: 33, windowDurationMins: 300, resetsAt: 1788573509 },
  secondary: { usedPercent: 63, windowDurationMins: 10080, resetsAt: 1788798916 },
  credits: { hasCredits: false, unlimited: false, balance: '0' },
  individualLimit: null,
  spendControlReached: false,
  planType: 'plus',
  rateLimitReachedType: null,
};

// The OTHER bucket off the very same read, kept because it is three of this
// file's cases at once and none of them is invented: a window that really
// reported zero, a `secondary` that is genuinely null, and a reset that is
// exactly its own window away.
const GPT_RESERVE = {
  limitId: 'base_model_inference',
  limitName: 'gpt-reserve',
  primary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: 1789170627 },
  secondary: null,
};

describe('reading what the app-server reported', () => {
  it('finds the five hour window and the week, in that order', () => {
    expect(codexLimits(HERS).map((l) => [l.span, l.name, l.percent])).toEqual([
      ['session', 'This session', 33],
      ['week', 'This week', 63],
    ]);
  });

  // The corner's bar is the five hour limit and always has been, and
  // `sessionLimit` is the one function that picks it. Codex's `primary` IS that
  // window: 300 minutes, off the capture above.
  it('is the five hour window that the bar is about', () => {
    expect(sessionLimit(codexLimits(HERS)).percent).toBe(33);
  });

  // The one arithmetic in this file, read against the capture rather than
  // against itself: 1788573509 seconds is 2h 8m after the moment it was taken.
  it('reads the reset as an instant in seconds, not in milliseconds', () => {
    expect(codexLimits(HERS)[0].resetsAt).toBe(1788573509 * 1000);
    expect(usageSentence(codexLimits(HERS), NOW)).toBe(
      'This session: 33% used, 2h 8m left. This week: 63% used, 2d 16h left.',
    );
  });

  // THE PROOF OF THE UNIT, AND IT IS THE CAPTURE'S OWN ARITHMETIC. This is the
  // `base_model_inference` bucket off the same read: its reset minus the moment
  // the read was taken is 604800 seconds, and the `windowDurationMins` printed
  // beside it is 10080, which is those 604800 seconds to the second. Read as
  // milliseconds the same field is nineteen years out.
  it('lands a reset exactly one window after the moment it was read', () => {
    const [window] = codexLimits(GPT_RESERVE);
    expect(GPT_RESERVE.primary.resetsAt - NOW / 1000).toBe(604800);
    expect(GPT_RESERVE.primary.windowDurationMins * 60).toBe(604800);
    expect(window.resetsAt - NOW).toBe(604800 * 1000);
    // AND IT IS CALLED A WEEK, WHICH THIS LINE USED TO GET WRONG. It read "This
    // session: 0% used, 7d left.", and that sentence disagrees with itself in
    // seven words: a session that resets in seven days is a week. The cause was
    // the reader taking `primary` to MEAN the five hour window rather than
    // reading `windowDurationMins`, which this very fixture carries at 10080.
    //
    // It cost nothing until 2026-09-18, when the founder's own Codex plan
    // turned out to report exactly one window and for it to be the weekly one.
    // Measured across the 1,140 rate-limit records in her twenty-five most
    // recent Codex sessions: every window was 10080 minutes and `secondary` was
    // never populated. Her whole week would have been drawn as an afternoon, on
    // a day it was at 100% used.
    expect(usageSentence([window], NOW)).toBe('This week: 0% used, 7d left.');
  });

  // NO CLAUDE CODE VOCABULARY OVER A CODEX READING. "This week, Fable" is a
  // Claude model name and `limitName` used to derive it from a qualifier the
  // Claude CLI prints; nothing in Codex's payload can produce it.
  it('never names a Claude model over a Codex reading', () => {
    const said = usageSentence(codexLimits(HERS), NOW);
    expect(said).not.toMatch(/Fable/);
    expect(said).not.toMatch(/all models/);
    for (const row of limitRows(codexLimits(HERS), NOW)) expect(row.name).not.toMatch(/,/);
  });
});

describe('a window that is not there', () => {
  // THE CASE THIS FILE IS NAMED FOR. `base_model_inference` really came back
  // like this on the live read.
  it('is absent from the rows rather than present at nothing', () => {
    const rows = codexLimits({ ...HERS, secondary: null });
    expect(rows).toHaveLength(1);
    expect(rows.map((l) => l.span)).toEqual(['session']);
  });

  it('is absent when the whole snapshot is, rather than a pair of zeroes', () => {
    expect(codexLimits({})).toEqual([]);
    expect(codexLimits(null)).toEqual([]);
    expect(codexLimits(undefined)).toEqual([]);
    expect(sessionLimit(codexLimits({}))).toBe(null);
    expect(usageSentence(codexLimits({}), NOW)).toBe(null);
  });

  // AND THE BOUNDARY THE OTHER SIDE, WHICH IS THE WHOLE POINT OF THE LAW: a
  // window that really did report zero IS drawn, at zero, with its name and its
  // bar. The two facts have to be tellable apart, so one of them must still say
  // something.
  it('is not the same fact as a window that really reported zero', () => {
    const real = codexLimits({ ...HERS, secondary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: 1788798916 } });
    expect(real).toHaveLength(2);
    expect(real[1].percent).toBe(0);
    expect(limitRows(real, NOW)[1]).toEqual({ key: 'week:', name: 'This week', used: 0, when: 'Resets in 2d 16h' });
    // Where the absent one draws no row at all.
    expect(limitRows(codexLimits({ ...HERS, secondary: null }), NOW)).toHaveLength(1);
  });

  // A percentage that is not a number is not a zero either. Nothing in the
  // measured payload does this; `usedPercent` is the one required field of a
  // window, so a window without one is not a window.
  it('is absent when the percentage is missing rather than read as none spent', () => {
    expect(codexLimits({ primary: { windowDurationMins: 300, resetsAt: 1788573509 } })).toEqual([]);
    expect(codexLimits({ primary: { usedPercent: null } })).toEqual([]);
  });

  // A window with no reset on it is still a real reading; `resetsAt` is nullable
  // in the schema. It keeps its bar and simply says nothing about when.
  it('keeps a window whose reset is unknown, and says nothing about when', () => {
    const rows = limitRows(codexLimits({ primary: { usedPercent: 33 } }), NOW);
    expect(rows).toEqual([{ key: 'session:', name: 'This session', used: 33, when: null }]);
  });
});

describe('a rolling update merges rather than replaces', () => {
  // The exact sentence out of the schema, made into behaviour: a notification
  // carrying only the five hour window may not take the week away.
  it('keeps the window a sparse update did not mention', () => {
    const after = mergeRateLimits(HERS, { primary: { usedPercent: 41, windowDurationMins: 300, resetsAt: 1788573509 } });
    expect(codexLimits(after).map((l) => l.percent)).toEqual([41, 63]);
  });

  it('keeps both when the update mentions neither, which this repo already sends', () => {
    // tests/one-codex-process-carries-many-threads-and-a-card-nobody-answers-denies.test.mjs
    // puts `{ rateLimits: {} }` on the wire. It must cost her nothing.
    expect(codexLimits(mergeRateLimits(HERS, {})).map((l) => l.percent)).toEqual([33, 63]);
    expect(codexLimits(mergeRateLimits(HERS, null)).map((l) => l.percent)).toEqual([33, 63]);
  });

  // A null in a rolling update "does not clear a previously observed value",
  // which is the schema's own wording and the case that would silently empty
  // the panel.
  it('does not let a null in an update clear a window she has already seen', () => {
    expect(codexLimits(mergeRateLimits(HERS, { secondary: null })).map((l) => l.percent)).toEqual([33, 63]);
  });

  // AND THE CASE THAT MUST NOT MATCH: an update that really carries a window
  // does replace it, or the reading would freeze at whatever landed first.
  it('takes both windows when the update really carries both', () => {
    const after = mergeRateLimits(HERS, {
      primary: { usedPercent: 90, windowDurationMins: 300, resetsAt: 1788573509 },
      secondary: { usedPercent: 91, windowDurationMins: 10080, resetsAt: 1788798916 },
    });
    expect(codexLimits(after).map((l) => l.percent)).toEqual([90, 91]);
  });

  // Nothing observed at all yet, and a first update that is empty. The honest
  // answer is still nothing, never a pair of zeroes.
  it('has nothing to show before anything has been observed', () => {
    expect(codexLimits(mergeRateLimits(null, {}))).toEqual([]);
    expect(codexLimits(mergeRateLimits(undefined, null))).toEqual([]);
  });
});
