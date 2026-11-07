// A TITLE STOPS AT A NATURAL BREAK, NEVER MID-PHRASE.
//
// Seen on the team version's photo stage (2026-11-01): threads were titled
// "Build the seat picker for group", "Find why Northside Clinic sees double",
// "Draw onboarding direction B as one" and "Write the words for a slot", and a
// short one kept its full stop, "Fix the flaky calendar-sync test.". Measured
// in shared/thread-title.mts: a sentence was cut at its sixth word wherever
// that fell, and only a small list of last words (a, the, to...) was trimmed,
// so a noun's modifier ("group", "double", "one") was left hanging; a line of
// six words or fewer came back as typed, full stop and all.
//
// Now a first clause of up to seven words is kept whole; a longer one stops
// before a preposition or conjunction, up to eight words; and no title ends on
// a full stop.
import { describe, it, expect } from 'vitest';
import { shortTitle } from '../shared/thread-title.mts';

describe('the five titles that were cut', () => {
  it.each([
    ['Build the seat picker for group bookings, 2 to 20 seats, and show it on a phone.', 'Build the seat picker for group bookings'],
    ['Draw onboarding direction B as one page, in our team look.', 'Draw onboarding direction B as one page'],
    ['Find why Northside Clinic sees double bookings on group slots.', 'Find why Northside Clinic sees double bookings'],
    // The phrase before "with" is whole; what the slot is like is the namer's job.
    ['Write the words for a slot with fewer than 2 seats left, by noon.', 'Write the words for a slot'],
    ['Fix the flaky calendar-sync test.', 'Fix the flaky calendar-sync test'],
  ])('"%s"', (opening, want) => {
    expect(shortTitle(opening)).toBe(want);
  });
});

describe('a long sentence', () => {
  it('stops before a preposition within eight words', () => {
    expect(shortTitle('Find why the reminder emails go out twice for clinics outside Lisbon on Mondays.')).toBe('Find why the reminder emails go out twice');
  });

  it('with no break in reach, keeps six words as before', () => {
    expect(shortTitle('Two patients at the Riverside clinic both got a confirmation for the 9:30 slot on Friday.')).toBe('Two patients at the Riverside clinic');
  });

  it('never ends on a small word or a full stop', () => {
    const small = /\s(?:a|an|the|of|to|for|at|on|in|with|by|from|and|or|but|as)$/i;
    for (const s of [
      'Build the seat picker for group bookings, 2 to 20 seats, and show it on a phone.',
      'Draw onboarding direction B as one page, in our team look.',
      'Find why Northside Clinic sees double bookings on group slots.',
      'Write the words for a slot with fewer than 2 seats left, by noon.',
      'Move the clinic calendar sync off the cron box and onto the worker queue.',
      'Ask the front desk at Northside to confirm the new opening hours for the holidays.',
    ]) {
      const t = shortTitle(s);
      expect(t, s).not.toMatch(small);
      expect(t, s).not.toMatch(/\.$/);
      expect(t.split(' ').length, s).toBeLessThanOrEqual(8);
    }
  });
});

describe('what must not change', () => {
  it.each(['Make tasks from findings 1 to 3', 'Why is CI red?', 'Fix login on Safari', 'iOS build', 'Ship the fix before'])('a short title as typed: "%s"', (typed) => {
    expect(shortTitle(typed)).toBe(typed);
  });

  it('a first clause of up to seven words is kept whole', () => {
    expect(shortTitle('Call the Riverside clinic manager and tell her.')).toBe('Call the Riverside clinic manager');
    expect(shortTitle('The checkout page is down for everyone.')).toBe('The checkout page is down for everyone');
  });

  it('an ellipsis is not a full stop', () => {
    expect(shortTitle('Wait for it...')).toBe('Wait for it...');
  });
});
