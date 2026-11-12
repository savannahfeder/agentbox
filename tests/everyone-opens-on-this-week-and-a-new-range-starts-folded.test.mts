// EVERYONE OPENS ON THIS WEEK, AND A NEW RANGE STARTS FOLDED.
//
// Reported 2026-11-12: the Everyone page opened on Today every time, though This
// week is the view wanted, and after "and N more" was opened on a list in Today,
// switching to This week drew that list's whole week expanded (224 done lines).
// The open state outlived the range it was opened in. Measured on the rules the
// page draws with; this repo has no DOM to click in.
import { describe, it, expect } from 'vitest';
import { EVERYONE_RANGE_KEY, SHOWN, everyoneRange, keepEveryoneRange, linesShown, type GroupLine } from '../renderer/src/team/today';

const store = (seed: Record<string, string> = {}) => {
  const m = new Map(Object.entries(seed));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
};
const lines = (n: number): GroupLine[] => Array.from({ length: n }, (_, i) => ({ key: `l${i}`, title: `Line ${i}`, at: i }));

describe('the range Everyone opens on', () => {
  it('is This week when nothing was picked', () => {
    expect(everyoneRange(store())).toBe('week');
  });

  it('is the one last picked', () => {
    const s = store();
    keepEveryoneRange(s, 'today');
    expect(everyoneRange(s)).toBe('today');
    keepEveryoneRange(s, 'yesterday');
    expect(everyoneRange(s)).toBe('yesterday');
  });

  it('falls back to This week for anything it does not know', () => {
    expect(everyoneRange(store({ [EVERYONE_RANGE_KEY]: 'month' }))).toBe('week');
    expect(everyoneRange({ getItem: () => { throw new Error('private mode'); } })).toBe('week');
  });
});

describe('a section opened with "and N more"', () => {
  const all = lines(SHOWN + 224);

  it('draws everything in the range it was opened in', () => {
    expect(linesShown(all, 'today', 'today')).toHaveLength(all.length);
  });

  it('is folded again in another range', () => {
    expect(linesShown(all, 'today', 'week')).toHaveLength(SHOWN);
    expect(linesShown(all, 'week', 'yesterday')).toHaveLength(SHOWN);
  });

  it('is folded when never opened', () => {
    expect(linesShown(all, null, 'week')).toHaveLength(SHOWN);
    expect(linesShown(lines(2), null, 'week')).toHaveLength(2);
  });
});
