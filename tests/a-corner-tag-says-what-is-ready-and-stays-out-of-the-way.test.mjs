// THE CORNER TAG (w-dafae58a23). In another app there was no way to tell
// whether any agent needed you, so agents sat idle without you knowing. The
// answer is a small tag in a corner of the screen: "2 ready for you" when an
// agent has something for you, "20 working" when none does, nothing at all
// when nothing is running. It must never become a nag: it hides for 5 minutes,
// 30 minutes or the rest of the day and then comes back, it is turned off only
// in Settings, it stays out of the way while you are in the app itself, and it
// goes wherever you drag it.
//
// Measured against shared/corner-tag.mjs, the rules the floating window and
// its page both follow. The cases are the ones that decide what you see: the
// count either side of zero, a hide that has just run out and one that has
// not, midnight, and a tag dragged to every quarter of the screen.
import { describe, expect, it } from 'vitest';
import {
  HIDE_CHOICES, hiddenUntil, tagSays, tagShows, waitedFor, cardLines, readyNow, RECENT_MS,
  restingSpot, keepCorner, cardPlacement, MARGIN,
} from '../shared/corner-tag.mjs';

const area = { x: 0, y: 0, width: 1728, height: 1080 };

describe('what the tag says', () => {
  it('names the agents ready for you when there are any', () => {
    expect(tagSays({ ready: 2, working: 18 })).toEqual({ kind: 'ready', text: '2 ready' });
    expect(tagSays({ ready: 1, working: 0 })).toEqual({ kind: 'ready', text: '1 ready' });
  });

  it('says how many are working when none is ready', () => {
    expect(tagSays({ ready: 0, working: 20 })).toEqual({ kind: 'working', text: '20 working' });
    expect(tagSays({ ready: 0, working: 1 })).toEqual({ kind: 'working', text: '1 working' });
  });

  it('says nothing when nothing is running and nothing is waiting', () => {
    expect(tagSays({ ready: 0, working: 0 })).toBe(null);
    expect(tagSays({})).toBe(null);
  });
});

describe('when the tag shows', () => {
  const now = 1_000_000;
  const base = { on: true, hiddenUntil: 0, now, inApp: false, ready: 2, working: 3 };

  it('shows when it is on, not hidden, you are elsewhere and something is happening', () => {
    expect(tagShows(base)).toBe(true);
    expect(tagShows({ ...base, ready: 0 })).toBe(true);
  });

  it('is on unless Settings turned it off', () => {
    expect(tagShows({ ...base, on: undefined })).toBe(true);
    expect(tagShows({ ...base, on: false })).toBe(false);
  });

  it('stays hidden until the hide runs out, and comes back the moment it does', () => {
    expect(tagShows({ ...base, hiddenUntil: now + 1 })).toBe(false);
    expect(tagShows({ ...base, hiddenUntil: now })).toBe(true);
    expect(tagShows({ ...base, hiddenUntil: now - 1 })).toBe(true);
  });

  it('gets out of the way while you are in the app itself', () => {
    expect(tagShows({ ...base, inApp: true })).toBe(false);
  });

  it('does not show an empty tag', () => {
    expect(tagShows({ ...base, ready: 0, working: 0 })).toBe(false);
  });
});

describe('hiding it for a while', () => {
  it('offers 5 minutes, 30 minutes and the rest of the day, and nothing permanent', () => {
    expect(HIDE_CHOICES.map((c) => c.key)).toEqual(['5m', '30m', 'today']);
  });

  it('hides for exactly 5 or 30 minutes', () => {
    const now = Date.UTC(2026, 9, 7, 15, 0, 0);
    expect(hiddenUntil('5m', now)).toBe(now + 5 * 60_000);
    expect(hiddenUntil('30m', now)).toBe(now + 30 * 60_000);
  });

  it('hides for the rest of the day until the next local midnight', () => {
    const now = new Date(2026, 9, 7, 15, 30).getTime();
    expect(hiddenUntil('today', now)).toBe(new Date(2026, 9, 8, 0, 0).getTime());
    const lateAtNight = new Date(2026, 9, 7, 23, 59, 30).getTime();
    expect(hiddenUntil('today', lateAtNight)).toBe(new Date(2026, 9, 8, 0, 0).getTime());
  });

  it('does not hide at all for a choice it does not know', () => {
    expect(hiddenUntil('forever', 5)).toBe(0);
    expect(hiddenUntil(undefined, 5)).toBe(0);
  });
});

describe('the list under the tag', () => {
  const now = 10 * 60 * 60_000;

  it('says how long each has waited, in units', () => {
    expect(waitedFor(now - 20_000, now)).toBe('now');
    expect(waitedFor(now - 3 * 60_000, now)).toBe('3 min');
    expect(waitedFor(now - 59 * 60_000, now)).toBe('59 min');
    expect(waitedFor(now - 60 * 60_000, now)).toBe('1 h');
    expect(waitedFor(now - 5 * 60 * 60_000, now)).toBe('5 h');
    expect(waitedFor(undefined, now)).toBe('');
  });

  it('puts the newest first and keeps the list short', () => {
    const ready = Array.from({ length: 7 }, (_, i) => ({ id: `w-${i}`, title: `T${i}`, says: 'is ready for you', since: now - i * 60_000 }));
    const { lines, more } = cardLines(ready, now);
    expect(lines.map((l) => l.id)).toEqual(['w-0', 'w-1', 'w-2', 'w-3', 'w-4']);
    expect(lines[0].waited).toBe('now');
    expect(lines[4].waited).toBe('4 min');
    expect(more).toBe(2);
  });

  it('has no "more" line when everything fits', () => {
    const { lines, more } = cardLines([{ id: 'a', title: 'A', says: 'needs a yes', since: now }], now);
    expect(lines).toHaveLength(1);
    expect(more).toBe(0);
  });
});

describe('only what is fresh counts (the first version counted the whole inbox)', () => {
  const now = Date.UTC(2026, 9, 8, 12, 0, 0);
  const hour = 60 * 60_000;

  it('keeps what became ready in the last day, newest first', () => {
    const r = readyNow([
      { id: 'old', since: now - 3 * 24 * hour },
      { id: 'an-hour', since: now - hour },
      { id: 'just-now', since: now - 60_000 },
    ], now);
    expect(r.map((x) => x.id)).toEqual(['just-now', 'an-hour']);
  });

  it('draws the line at a day: one minute inside counts, one minute past does not', () => {
    const r = readyNow([
      { id: 'inside', since: now - RECENT_MS + 60_000 },
      { id: 'past', since: now - RECENT_MS - 60_000 },
    ], now);
    expect(r.map((x) => x.id)).toEqual(['inside']);
  });

  it('always counts an agent stopped on a yes, which has no moment it became ready', () => {
    const r = readyNow([{ id: 'ask', since: undefined }, { id: 'old', since: now - 5 * 24 * hour }], now);
    expect(r.map((x) => x.id)).toEqual(['ask']);
  });

  it('counts nothing from an inbox of only old threads', () => {
    const old = Array.from({ length: 22 }, (_, i) => ({ id: `w-${i}`, since: now - (2 + i) * 24 * hour }));
    expect(readyNow(old, now)).toHaveLength(0);
  });
});

describe('where it sits', () => {
  const size = { width: 140, height: 26 };

  it('rests in the bottom-right corner the first time', () => {
    expect(restingSpot(null, size, [area])).toEqual({ x: 1728 - MARGIN - 140, y: 1080 - MARGIN - 26 });
  });

  it('goes back where you dragged it', () => {
    expect(restingSpot({ x: 40, y: 300 }, size, [area])).toEqual({ x: 40, y: 300 });
  });

  it('is pulled back on screen when the screen it was on is gone', () => {
    expect(restingSpot({ x: 5000, y: 300 }, size, [area])).toEqual({ x: 1728 - 140, y: 300 });
    expect(restingSpot({ x: -400, y: -20 }, size, [area])).toEqual({ x: 0, y: 0 });
  });

  it('keeps the edge nearest its corner still when its words change length', () => {
    const right = { x: 1570, y: 1036, width: 140, height: 26 };
    expect(keepCorner(right, { width: 100, height: 26 }, area)).toEqual({ x: 1610, y: 1036, width: 100, height: 26 });
    const left = { x: 18, y: 1036, width: 140, height: 26 };
    expect(keepCorner(left, { width: 100, height: 26 }, area)).toEqual({ x: 18, y: 1036, width: 100, height: 26 });
  });
});

describe('which way the list opens', () => {
  const card = { width: 360, height: 110 };

  it('opens up and to the left from the bottom-right corner', () => {
    const tag = { x: 1570, y: 1036, width: 140, height: 26 };
    const p = cardPlacement(tag, card, area);
    expect(p.above).toBe(true);
    expect(p.alignRight).toBe(true);
    expect(p.card.x + p.card.width).toBe(tag.x + tag.width);
    expect(p.card.y + p.card.height).toBeLessThan(tag.y);
  });

  it('opens down and to the right from the top-left corner', () => {
    const tag = { x: 18, y: 18, width: 140, height: 26 };
    const p = cardPlacement(tag, card, area);
    expect(p.above).toBe(false);
    expect(p.alignRight).toBe(false);
    expect(p.card.x).toBe(tag.x);
    expect(p.card.y).toBeGreaterThan(tag.y + tag.height);
  });

  it('opens the other way when the side it prefers has no room', () => {
    const short = { x: 0, y: 0, width: 1728, height: 300 };
    const low = { x: 1570, y: 160, width: 140, height: 26 };
    const p = cardPlacement(low, { width: 360, height: 200 }, short);
    expect(p.card.y).toBeGreaterThanOrEqual(0);
    expect(p.card.y + p.card.height).toBeLessThanOrEqual(300);
  });

  it('stays on screen when the tag sits right against an edge', () => {
    const tag = { x: 1700, y: 600, width: 28, height: 26 };
    const p = cardPlacement(tag, card, area);
    expect(p.card.x).toBeGreaterThanOrEqual(0);
    expect(p.card.x + p.card.width).toBeLessThanOrEqual(1728);
  });
});
