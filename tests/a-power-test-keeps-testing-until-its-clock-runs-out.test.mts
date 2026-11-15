// A POWER TEST KEEPS TESTING UNTIL ITS CLOCK RUNS OUT.
//
// What was wrong (w-811757c0b5, 2026-10-20): asked to test the app, agents
// tested it "for about 2 minutes and say, okay this is all great". The only
// agent that drove the app through its screen (verify-agentbox's breaker) was
// one Claude Code session with a 15-minute cap, which ended whenever the
// session decided it was finished. Nothing could hold one for hours.
//
// Now the power test's clock owns the session: a tester that stops early is
// started again with what it has and has not done, until the deadline. And
// the loop ends on its own when the tester cannot act (three idle rounds, a
// failed sign-in, its own usage gone), so it never retries for ever.
import { describe, it, expect } from 'vitest';
import { nextRound, roundOutcome, phaseAt } from '../.claude/skills/power-test/scripts/plan.mjs';

const MIN = 60_000;

describe('whether another round starts', () => {
  it('starts one when the last ended early and there is time left', () => {
    const r = nextRound({ now: 0, deadline: 120 * MIN, roundMs: 20 * MIN, idleInARow: 0, lastOutcome: 'acted' });
    expect(r).toEqual({ go: true, endsAt: 20 * MIN });
  });

  it('ends the last round at the deadline, not past it', () => {
    expect(nextRound({ now: 110 * MIN, deadline: 120 * MIN, roundMs: 20 * MIN }).endsAt).toBe(120 * MIN);
  });

  it('starts none with under a minute left', () => {
    expect(nextRound({ now: 119.5 * MIN, deadline: 120 * MIN, roundMs: 20 * MIN })).toMatchObject({ go: false, why: 'time is up' });
    expect(nextRound({ now: 119 * MIN, deadline: 120 * MIN, roundMs: 20 * MIN }).go).toBe(true);
  });

  it('gives up after three rounds in a row that did nothing, and not after two', () => {
    expect(nextRound({ now: 0, deadline: 120 * MIN, roundMs: 20 * MIN, idleInARow: 2 }).go).toBe(true);
    expect(nextRound({ now: 0, deadline: 120 * MIN, roundMs: 20 * MIN, idleInARow: 3 })).toMatchObject({ go: false, why: 'the tester did nothing in 3 rounds in a row' });
  });

  it('stops at once when the tester cannot sign in or is out of usage itself', () => {
    expect(nextRound({ now: 0, deadline: 120 * MIN, roundMs: 20 * MIN, lastOutcome: 'signed-out' }).go).toBe(false);
    expect(nextRound({ now: 0, deadline: 120 * MIN, roundMs: 20 * MIN, lastOutcome: 'tester-out' }).go).toBe(false);
  });
});

describe('what a round amounted to', () => {
  it('acted when it took three actions or more', () => {
    expect(roundOutcome({ actions: 3 })).toBe('acted');
    expect(roundOutcome({ actions: 2 })).toBe('idle');
  });

  it('signed out or out of usage only when it took no action and said so', () => {
    expect(roundOutcome({ actions: 0, text: 'Invalid API key · Please run /login' })).toBe('signed-out');
    expect(roundOutcome({ actions: 0, text: "You've hit your session limit · resets 4pm" })).toBe('tester-out');
    // A tester that read the words on the app's screen is not itself out.
    expect(roundOutcome({ actions: 40, text: "the thread said You've hit your session limit" })).toBe('acted');
  });
});

describe('where in their day a tester is', () => {
  const person = { day: ['Morning triage', 'Deep work', 'Meetings', 'Wrap up'] };
  it('follows how far through the test it is, and stays on the last part at the end', () => {
    expect(phaseAt(person, 0)).toBe('Morning triage');
    expect(phaseAt(person, 0.49)).toBe('Deep work');
    expect(phaseAt(person, 0.5)).toBe('Meetings');
    expect(phaseAt(person, 1)).toBe('Wrap up');
  });
});
