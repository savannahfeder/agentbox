// THE TRAY BECAME WALLPAPER (w-93b3a1a796). It counted everything in Needs you,
// so for anyone not at inbox zero it never went away: her screenshot showed
// "25 waiting" in the corner of a dark screen, and her words were "it's just
// always there. I personally want to ignore it and even want to delete it."
//
// It now counts only what started waiting after you last had the app in front,
// and when nothing is new it is gone, not quiet. Leaving the app is the moment
// that counts as having looked: the tray already steps aside while the app is
// in front, so whatever waited then has been seen.
//
// Measured against shared/corner-tag.mjs and against main/corner-tag.mjs with
// a pretend app window: the moment either side of your last look, an approval
// that has no moment of its own, a restart, and the first run before you have
// ever looked. The list cases come from the test this replaces
// (the-corner-tag-counts-everything-that-needs-you, w-0961e5523b): newest first
// and three lines still hold.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardLines, newSince, readyNow, tagSays, tagShows } from '../shared/corner-tag.mjs';
import { cornerTagRig } from './helpers/corner-tag-rig.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const minute = 60_000;
const hour = 60 * minute;

describe('what counts as new', () => {
  const looked = Date.UTC(2026, 9, 23, 12, 0, 0);

  it('counts what started waiting after your last look, and nothing from before it', () => {
    const ready = [
      { id: 'before', since: looked - minute },
      { id: 'after', since: looked + minute },
      { id: 'long-before', since: looked - 6 * 24 * hour },
    ];
    expect(newSince(ready, looked).map((r) => r.id)).toEqual(['after']);
  });

  it('holds the boundary: the moment you looked is seen, the moment after is new', () => {
    expect(newSince([{ id: 'same', since: looked }], looked)).toEqual([]);
    expect(newSince([{ id: 'next', since: looked + 1 }], looked).map((r) => r.id)).toEqual(['next']);
  });

  it('counts everything before you have ever looked', () => {
    const ready = [{ id: 'a', since: looked - 3 * 24 * hour }, { id: 'b', since: looked }];
    expect(newSince(ready, 0)).toHaveLength(2);
    expect(newSince(ready, undefined)).toHaveLength(2);
  });

  it('counts nothing that has no moment it started waiting, unless you have never looked', () => {
    expect(newSince([{ id: 'ask' }], looked)).toEqual([]);
    expect(newSince([{ id: 'ask' }], 0)).toHaveLength(1);
    expect(newSince(undefined, looked)).toEqual([]);
  });
});

describe('what the tray says', () => {
  it('is the mark and how many are new, and says "waiting" to anyone reading it aloud', () => {
    expect(tagSays({ ready: 2 })).toEqual({ kind: 'ready', text: '2', label: '2 waiting' });
    expect(tagSays({ ready: 1, working: 18 })).toEqual({ kind: 'ready', text: '1', label: '1 waiting' });
  });

  it('says nothing at all when nothing is new, however many are working', () => {
    expect(tagSays({ ready: 0, working: 20 })).toBe(null);
    expect(tagSays({})).toBe(null);
  });

  it('is gone when nothing is new', () => {
    const base = { on: true, hiddenUntil: 0, now: 5, inApp: false };
    expect(tagShows({ ...base, ready: 0, working: 18 })).toBe(false);
    expect(tagShows({ ...base, ready: 1, working: 0 })).toBe(true);
  });
});

describe('the list of what is new', () => {
  const now = Date.UTC(2026, 9, 23, 12, 0, 0);

  it('leads with the newest three and folds the rest into "and N more"', () => {
    const ready = Array.from({ length: 5 }, (_, i) => ({ id: `n-${i}`, since: now - i * minute }));
    const { lines, more } = cardLines(readyNow([...ready].reverse(), now), now);
    expect(lines.map((l) => l.id)).toEqual(['n-0', 'n-1', 'n-2']);
    expect(more).toBe(2);
  });
});

const T = 1_000_000_000;
const waiting = (since, id = `w-${since}`) => ({ id, title: id, says: 'is ready for you', since });

describe('leaving the app is having looked', () => {
  it('shows only what started waiting after you last left, and says how many were there before', () => {
    const r = cornerTagRig({ at: T, config: { cornerTagLookedAt: T - hour } });
    r.hand({ ready: [waiting(T - 2 * hour, 'old'), waiting(T - 30 * minute, 'new')], working: 18 });
    r.pageUp();
    expect(r.win().visible).toBe(true);
    expect(r.lastState().ready.map((x) => x.id)).toEqual(['new']);
    expect(r.lastState().before).toBe(1);
  });

  it('stays away when nothing is new, even with agents working and threads waiting', () => {
    const r = cornerTagRig({ at: T, config: { cornerTagLookedAt: T - minute } });
    r.hand({ ready: [waiting(T - hour), waiting(T - 2 * hour)], working: 18 });
    expect(r.windows).toHaveLength(0);
  });

  it('starts the count again from zero each time you leave the app, and remembers when', () => {
    const r = cornerTagRig({ at: T, focused: true });
    r.hand({ ready: [waiting(T - hour), waiting(T - minute)], working: 3 });
    r.advance(5 * minute);
    r.leaveApp();
    expect(r.config.cornerTagLookedAt).toBe(T + 5 * minute);
    r.hand({ ready: [waiting(T - hour), waiting(T - minute)], working: 3 });
    expect(r.windows).toHaveLength(0);
    // An agent finishes while you are in another app.
    r.advance(10 * minute);
    r.hand({ ready: [waiting(T - hour), waiting(T - minute), waiting(r.clock(), 'fresh')], working: 2 });
    r.pageUp();
    expect(r.win().visible).toBe(true);
    expect(r.lastState().ready.map((x) => x.id)).toEqual(['fresh']);
    expect(r.lastState().before).toBe(2);
  });

  it('counts coming back to the app as a look too, and hides while you are there', () => {
    const r = cornerTagRig({ at: T, config: { cornerTagLookedAt: T - hour } });
    r.hand({ ready: [waiting(T - minute, 'new')], working: 0 });
    r.pageUp();
    expect(r.win().visible).toBe(true);
    r.advance(minute);
    r.enterApp();
    expect(r.win().visible).toBe(false);
    r.leaveApp();
    expect(r.win().visible).toBe(false);
  });

  it('keeps your last look across a restart', () => {
    const config = {};
    const first = cornerTagRig({ at: T, focused: true, config });
    first.leaveApp();
    expect(config.cornerTagLookedAt).toBe(T);
    const again = cornerTagRig({ at: T + hour, config });
    again.hand({ ready: [waiting(T - minute, 'seen'), waiting(T + minute, 'new')], working: 0 });
    again.pageUp();
    expect(again.lastState().ready.map((x) => x.id)).toEqual(['new']);
  });

  it('counts everything waiting until you have looked once', () => {
    const r = cornerTagRig({ at: T });
    r.hand({ ready: [waiting(T - 3 * 24 * hour, 'old')], working: 4 });
    r.pageUp();
    expect(r.win().visible).toBe(true);
    expect(r.lastState().ready.map((x) => x.id)).toEqual(['old']);
  });
});

describe('an agent stopped on a yes, which has no moment of its own', () => {
  const ask = (id) => ({ id, title: 'Northwind', says: 'needs a yes', open: null });

  it('is not new if it was already waiting when you left', () => {
    const r = cornerTagRig({ at: T, focused: true });
    r.hand({ ready: [ask('a-1')], working: 1 });
    r.advance(minute);
    r.leaveApp();
    r.advance(minute);
    r.hand({ ready: [ask('a-1')], working: 1 });
    expect(r.windows).toHaveLength(0);
  });

  // Without a moment of its own, a restart made every waiting approval new
  // again, because the tray first saw them after the restart.
  it('is handed the moment it was asked, so a restart does not count it again', () => {
    const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
    expect(app).toMatch(/says: 'needs a yes', since: a\.at/);
  });

  it('is new when it first appears after you left', () => {
    const r = cornerTagRig({ at: T, focused: true });
    r.leaveApp();
    r.advance(minute);
    r.hand({ ready: [ask('a-2')], working: 1 });
    r.pageUp();
    expect(r.win().visible).toBe(true);
    expect(r.lastState().ready.map((x) => x.id)).toEqual(['a-2']);
  });
});
