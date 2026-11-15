// A REPEATING RUN READS AS YOUR WORDS, ON THE DAY IT RAN (w-31c71743b5, 2026-10-29).
//
// The founder sent the first-run idea "Summarize this week's AI news in five
// bullets" (every Monday) on a Thursday. Its working page said "You asked:
// THIS IS ONE RUN OF A REPEATING TASK. It runs again at its next time..." (the
// rules the app gives the agent, read off the run's body), and its title ended
// "· Mon, Oct 26", a day three days gone, because a run made late was stamped
// with the period it served rather than the day it ran.
import { describe, it, expect } from 'vitest';
import { OCCURRENCE_PROTOCOL, occurrenceFields } from '../main/repeats.mts';

const { askLine } = await import('../renderer/src/one-thing-at-a-time.ts');

const ASK = 'Summarize this week’s AI news in five bullets';
const body = `${OCCURRENCE_PROTOCOL.replace('<REPEAT_LABEL>', 'repeat:r-1')}\n\n${ASK}`;
const stamp = (y, m, d) => new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

describe('the ask line on a working run', () => {
  it('is never the rules the agent was given', () => {
    expect(askLine(body, 'Weekly news')).toBe(`You asked: ${ASK}.`);
  });
  it('is left out when the title is the ask with its day after it', () => {
    expect(askLine(body, `${ASK} · ${stamp(2026, 10, 29)}`)).toBeNull();
  });
  it('still shows an ask the title only begins like', () => {
    expect(askLine('Fix the login button on the settings page', 'Fix the login')).toBe('You asked: Fix the login button on the settings page.');
  });
});

describe('the day in a run’s title', () => {
  const rule = { id: 'r-1', title: ASK, instruction: ASK, every: 'week', on: 1, at: '09:00' };
  it('is the day it ran when it was made after the day it serves', () => {
    expect(occurrenceFields(rule, '2026-10-26', new Date(2026, 9, 29, 14).getTime()).title).toBe(`${ASK} · ${stamp(2026, 10, 29)}`);
  });
  it('is the day it serves when made on that day', () => {
    expect(occurrenceFields(rule, '2026-10-26', new Date(2026, 9, 26, 9, 1).getTime()).title).toBe(`${ASK} · ${stamp(2026, 10, 26)}`);
  });
  it('is the day it serves for a run planned ahead, which has no time yet', () => {
    expect(occurrenceFields(rule, '2026-11-02').title).toBe(`${ASK} · ${stamp(2026, 11, 2)}`);
  });
});
