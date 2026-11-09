// THE PHONE APP'S LATER TAKES A TIME IN WORDS, AND NOW.
//
// The phone site's Later (renderer/src/components/Snooze.tsx) offers its
// presets, a box that reads a time typed in words ("3h", "fri 6pm"), and, on
// a thread already in Later, "Now (back to inbox)" first. The app's sheet had
// the presets only, so a thread could not be put off to a time of her own or
// brought back early from the phone; Codex's parity audit found it. These pin
// the app's rows and its reading of typed words (mobile/src/lib/later.ts) to
// the site's, and what must not appear: "Now" on a thread that is not put off,
// and a time read out of words that are not one.
import { describe, it, expect } from 'vitest';
import { laterRows, typedLater, typedLine } from '../mobile/src/lib/later';
import { laterPresets } from '../renderer/src/later-times';
import { dayAndTime } from '../renderer/src/format';

const NOW = new Date(2026, 9, 20, 10, 0).getTime();

describe('the rows', () => {
  it('are the phone site\'s presets, each with its day and time', () => {
    expect(laterRows(NOW, { back: false })).toEqual(laterPresets(NOW).map((p) => ({ label: p.label, ts: p.ts, hint: dayAndTime(p.ts, NOW).toUpperCase() })));
  });

  it('a thread already in Later can come back now, and that row is first', () => {
    const rows = laterRows(NOW, { back: true });
    expect(rows[0]).toEqual({ label: 'Now (back to inbox)', ts: 0, hint: '', now: true });
    expect(rows.slice(1).map((r) => r.label)).toEqual(laterPresets(NOW).map((p) => p.label));
  });

  it('a thread not put off has no "Now"', () => {
    expect(laterRows(NOW, { back: false }).some((r) => r.now)).toBe(false);
  });
});

describe('a time typed in words', () => {
  it('reads the words the site reads, and says when', () => {
    const at = typedLater('3h', NOW);
    expect(at.ts).toBe(NOW + 3 * 3_600_000);
    expect(typedLine('3h', at, false)).toEqual({ text: dayAndTime(at.ts, NOW).toUpperCase(), tone: 'ok' });
  });

  it('reads a day and an hour', () => {
    const at = typedLater('tomorrow 9am', NOW);
    expect(new Date(at.ts).getDate()).toBe(21);
    expect(new Date(at.ts).getHours()).toBe(9);
  });

  it('words that are not a time are refused, and say what would work once she presses', () => {
    expect(typedLater('when it feels right', NOW)).toBeNull();
    expect(typedLine('when it feels right', null, false)).toEqual({ text: 'not a time', tone: 'unread' });
    expect(typedLine('when it feels right', null, true)).toEqual({ text: 'not a time · try 3h, 8am, tomorrow', tone: 'refused' });
  });

  it('an empty box says nothing', () => {
    expect(typedLine('  ', null, false)).toBeNull();
  });
});
