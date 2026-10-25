// THE PANEL COULD NOT SAY "YOU ARE OUT", BECAUSE THE FIELD THAT SAYS SO WAS
// DROPPED (w-36c51443df).
//
// MEASURED 2026-10-09 on codex-cli 0.160.0. A real `codex app-server` on her
// own Codex home, one real turn, and the `account/rateLimits/updated` push
// caught at `onNotification` -- the one channel main/codex-usage.mjs draws the
// corner from. Repeat with `node scripts/qa-codex-live.mjs usage`.
//
//   { "rateLimits": {
//       "limitId": "codex", "limitName": null, "normalModelSlug": null,
//       "primary": { "usedPercent": 49, "windowDurationMins": 10080,
//                    "resetsAt": 1792001987 },
//       "secondary": null,
//       "credits": { "hasCredits": false, "unlimited": false, "balance": "0" },
//       "individualLimit": null,
//       "spendControlReached": null,
//       "planType": "prolite",
//       "rateLimitReachedType": null } }
//
// `codexLimits` read `primary` and `secondary`. The other eight fields were
// thrown away, and two of them -- `rateLimitReachedType` and
// `spendControlReached` -- are the only things in the payload that can ever say
// the limit has been REACHED rather than merely be a percentage near a hundred.
// A payload differing ONLY in those two produced an identical reading, so there
// was no state the corner could enter that meant "spent".
//
// And a percentage could not stand in for it: the reading rounded, so 99.6%
// drew as "100%". "100%" did not mean spent and nothing did.
//
// THE FIX IS TWO THINGS AND THEY ARE SEPARATE. `codexLimits` now marks the
// window the provider says is exhausted, and `codexPlan` reads the
// account-level facts the panel had no way to name. The rounding no longer
// manufactures a hundred: a window is only drawn at 100 when it really is
// finished.
import { describe, expect, it } from 'vitest';
import { codexLimits, codexPlan, mergeRateLimits, windowSpan } from '../shared/codex-usage.mjs';

/** The push above, verbatim, as it arrived. */
const MEASURED = Object.freeze({
  limitId: 'codex',
  limitName: null,
  normalModelSlug: null,
  primary: { usedPercent: 49, windowDurationMins: 10080, resetsAt: 1792001987 },
  secondary: null,
  credits: { hasCredits: false, unlimited: false, balance: '0' },
  individualLimit: null,
  spendControlReached: null,
  planType: 'prolite',
  rateLimitReachedType: null,
});

describe('the window lines, out of what arrived', () => {
  it('draws the weekly window the push really carried', () => {
    expect(codexLimits(MEASURED)).toEqual([{
      span: 'week',
      qualifier: null,
      name: 'This week',
      percent: 49,
      reached: false,
      resetsText: null,
      resetsOn: null,
      resetsAt: 1792001987000,
      zone: null,
    }]);
  });

  it('draws one line and not two, because the five-hour window is never sent', () => {
    // `secondary: null` on every record of hers on disk and on every live push
    // caught. Not a defect -- a fact about this plan -- but it means the
    // corner's second line is dead on this account.
    expect(MEASURED.secondary).toBeNull();
    expect(codexLimits(MEASURED)).toHaveLength(1);
    expect(windowSpan(10080)).toEqual(['week', 'This week']);
  });

  it('marks the window the provider says is exhausted, and only that one', () => {
    // `rateLimitReachedType` NAMES the window, so it lands on that window's own
    // line rather than on the reading as a whole.
    const both = {
      primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: 1 },
      secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 2 },
      rateLimitReachedType: 'primary',
    };
    const [session, week] = codexLimits(both);
    expect(session.span).toBe('session');
    expect(session.reached).toBe(true);
    expect(week.span).toBe('week');
    expect(week.reached).toBe(false);
  });

  it('no longer draws the same line whether or not the limit was reached', () => {
    // The whole of the old consequence, now inverted into a guard: a payload
    // differing ONLY in the reached field must differ in the reading.
    const spent = { ...MEASURED, rateLimitReachedType: 'primary' };
    expect(codexLimits(spent)).not.toEqual(codexLimits(MEASURED));
    expect(codexLimits(spent)[0].reached).toBe(true);
  });

  it('believes the provider over the percentage, in both directions', () => {
    // A window can be refused below a hundred (a spend control, a per-account
    // limit), and a window at a hundred may still be serving. The provider's
    // word is the authority either way; the percentage is only a picture.
    const lowButDone = { primary: { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1 }, rateLimitReachedType: 'primary' };
    expect(codexLimits(lowButDone)[0]).toMatchObject({ percent: 12, reached: true });
    const fullButFine = { primary: { usedPercent: 100, windowDurationMins: 10080, resetsAt: 1 } };
    expect(codexLimits(fullButFine)[0]).toMatchObject({ percent: 100, reached: false });
  });

  it('ignores a reached field naming a window that is not in the payload', () => {
    const odd = { ...MEASURED, rateLimitReachedType: 'secondary' };
    expect(codexLimits(odd)).toHaveLength(1);
    expect(codexLimits(odd)[0].reached).toBe(false);
  });
});

describe('the percentage at the top of its range', () => {
  const week = (used, rest = {}) => codexLimits({ primary: { used_percent: used, window_minutes: 10080, resets_at: 1 }, ...rest })[0].percent;

  it('does not say a hundred before a hundred is spent', () => {
    // 99.6% of a weekly window still has work left in it, and the corner used
    // to call that 100%. A figure that cannot be acted on is worse than a
    // blunter one, so anything short of the whole thing draws at most 99.
    expect(week(99)).toBe(99);
    expect(week(99.4)).toBe(99);
    expect(week(99.6)).toBe(99);
    expect(week(99.99)).toBe(99);
  });

  it('says a hundred only when it really is a hundred', () => {
    expect(week(100)).toBe(100);
  });

  it('leaves the figure alone when the provider refuses the window', () => {
    // A window capped at 99.6% by a spend control really is at 99.6%, and
    // writing 100 over it would invent usage nobody reported -- the same sin
    // the rounding was. `reached` carries the "stop"; `percent` carries the
    // spend, and the two never overwrite each other.
    expect(week(99.6, { rateLimitReachedType: 'primary' })).toBe(99);
    expect(week(12, { rateLimitReachedType: 'primary' })).toBe(12);
  });

  it('never draws a figure outside nought to a hundred', () => {
    // Clamping is right and stays right: a provider that over- or under-reports
    // must not put an impossible number on her screen.
    expect(week(120)).toBe(100);
    expect(week(-5)).toBe(0);
    expect(week(0)).toBe(0);
  });
});

describe('the account-level facts the corner had no way to name', () => {
  it('reads the plan the push carried', () => {
    expect(codexPlan(MEASURED)).toMatchObject({ plan: 'prolite' });
  });

  it('says there is nothing behind the window when the balance is nought', () => {
    // She was carrying `balance: "0"` and `hasCredits: false`, so when the
    // weekly window goes there is nothing to fall back on. The corner could not
    // say that, and "100% used" reads very differently with and without it.
    expect(codexPlan(MEASURED)).toMatchObject({ credits: false, unlimitedCredits: false });
  });

  it('reads credits and a spend control when they are there', () => {
    const rich = {
      ...MEASURED,
      credits: { hasCredits: true, unlimited: false, balance: '2500' },
      spendControlReached: true,
    };
    expect(codexPlan(rich)).toMatchObject({ credits: true, spendControlReached: true });
  });

  it('answers nulls rather than guesses when the push says nothing', () => {
    // A plan nobody reported may never be drawn as a plan, for the same reason
    // main/codex-usage.mjs refuses to draw an unread limit as a zero.
    expect(codexPlan({})).toEqual({ plan: null, credits: null, unlimitedCredits: null, spendControlReached: null, reached: null });
    expect(codexPlan(null)).toEqual({ plan: null, credits: null, unlimitedCredits: null, spendControlReached: null, reached: null });
  });

  it('carries which window was refused, for anything drawing the whole reading', () => {
    expect(codexPlan({ ...MEASURED, rateLimitReachedType: 'primary' })).toMatchObject({ reached: 'primary' });
  });
});

describe('a rolling update folds in rather than replacing', () => {
  it('keeps the week when a push carries only the shorter window', () => {
    const first = mergeRateLimits(null, MEASURED);
    expect(first.primary.usedPercent).toBe(49);
    const onlyShort = mergeRateLimits(first, { secondary: { usedPercent: 3, windowDurationMins: 300, resetsAt: 1 } });
    expect(onlyShort.primary.usedPercent).toBe(49);
    expect(onlyShort.secondary.usedPercent).toBe(3);
  });

  it('keeps both when a push carries neither', () => {
    const both = mergeRateLimits(MEASURED, { secondary: { usedPercent: 3, windowDurationMins: 300, resetsAt: 1 } });
    const empty = mergeRateLimits(both, {});
    expect(empty.primary.usedPercent).toBe(49);
    expect(empty.secondary.usedPercent).toBe(3);
  });

  it('carries the account-level fields across a fold, so a cap is not forgotten', () => {
    // THE FOLD HAS TO COVER THESE TOO. A push carrying only a window would
    // otherwise drop a `rateLimitReachedType` that arrived a beat earlier, and
    // the corner would go from "spent" back to a percentage for no reason --
    // the same failure the window fold already exists to prevent.
    const capped = mergeRateLimits(MEASURED, { ...MEASURED, rateLimitReachedType: 'primary', planType: 'prolite' });
    const later = mergeRateLimits(capped, { primary: { usedPercent: 100, windowDurationMins: 10080, resetsAt: 1 } });
    expect(codexPlan(later)).toMatchObject({ reached: 'primary', plan: 'prolite' });
    expect(codexLimits(later)[0].reached).toBe(true);
  });
});
