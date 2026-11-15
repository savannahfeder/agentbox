// SEND LATER TAKES A TIME IN WORDS, NOT A DATE PICKER.
//
// Reported 2026-10-02 with a screenshot of the composer's Send later menu:
// "Pick a date and time" opened a browser date field (10/03/2026, 08:00 AM)
// that you step through segment by segment, while the Schedule box on a
// thread already took "30m, 3h, 8am, tomorrow, next week". The ask was for the
// composer to read words too. So the field is now a text box, read by the
// same `parseWhen` the Schedule box uses, and that grammar learned the two
// phrases a person reaches for first that it refused: "tomorrow 3pm" and
// "today at 5pm".
//
// Every date is built in local time. 2026-10-01 is a Thursday.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { momentFromWords } from '../renderer/src/threads/composer-rules.ts';
import { parseWhen } from '../renderer/src/format.ts';

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const now = at(2026, 10, 1, 12);

describe('a time typed into Send later', () => {
  it('reads the words the Schedule box already reads', () => {
    expect(momentFromWords('3h', now)?.ts).toBe(at(2026, 10, 1, 15));
    expect(momentFromWords('in 30 minutes', now)?.ts).toBe(at(2026, 10, 1, 12, 30));
    expect(momentFromWords('tomorrow', now)?.ts).toBe(at(2026, 10, 2, 8));
    expect(momentFromWords('fri 6pm', now)?.ts).toBe(at(2026, 10, 2, 18));
    expect(momentFromWords('next week', now)?.ts).toBe(at(2026, 10, 5, 8));
  });

  it('carries the short day and clock the other rows show on their right', () => {
    expect(momentFromWords('fri 6pm', now)?.hint).toBe('Fri 18:00');
  });

  it('is nothing at all while the box is empty', () => {
    expect(momentFromWords('', now)).toBeNull();
    expect(momentFromWords('   ', now)).toBeNull();
  });

  it('refuses words it cannot read rather than guessing', () => {
    expect(momentFromWords('after my meeting', now)).toBeNull();
    expect(momentFromWords('whenever', now)).toBeNull();
  });
});

describe('tomorrow and today with a time on them', () => {
  it('reads "tomorrow 3pm" and "tomorrow at 3pm" as three tomorrow afternoon', () => {
    expect(parseWhen('tomorrow 3pm', now)?.ts).toBe(at(2026, 10, 2, 15));
    expect(parseWhen('tomorrow at 3pm', now)?.ts).toBe(at(2026, 10, 2, 15));
    expect(parseWhen('Tomorrow at 9:30am', now)?.ts).toBe(at(2026, 10, 2, 9, 30));
  });

  it('keeps bare "tomorrow" and "tomorrow morning" at eight', () => {
    expect(parseWhen('tomorrow', now)?.ts).toBe(at(2026, 10, 2, 8));
    expect(parseWhen('tomorrow morning', now)?.ts).toBe(at(2026, 10, 2, 8));
  });

  it('reads "today at 5pm" as five this afternoon', () => {
    expect(parseWhen('today at 5pm', now)?.ts).toBe(at(2026, 10, 1, 17));
    expect(parseWhen('today 17:00', now)?.ts).toBe(at(2026, 10, 1, 17));
  });

  // "today" said out loud is a promise about today. Rolling a past hour on to
  // tomorrow, the way a bare "9am" does, would quietly change the day she named.
  it('refuses a time today that has already gone', () => {
    expect(parseWhen('today at 9am', now)).toBeNull();
    expect(parseWhen('today at 12pm', now)).toBeNull();
  });

  it('does not read a word that only starts like a day', () => {
    expect(parseWhen('tomorrowland', now)).toBeNull();
    expect(parseWhen('tomorrow sometime', now)).toBeNull();
    expect(parseWhen('todays standup', now)).toBeNull();
  });
});

describe('the composer', () => {
  const src = readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');

  it('has no browser date field left in Send later', () => {
    expect(src).not.toContain('datetime-local');
  });

  it('reads the typed time with momentFromWords', () => {
    expect(src).toContain('momentFromWords(');
  });
});
