// A LEVEL TAKES MONTHS TO MASTER, NOT WEEKS (w-9bcb697d54, 2026-10-21).
//
// About a month of use showed 1,945 agent hours and level 72. The old curve,
// 1 + floor(98 * cbrt(h / 5000)) capped at 99, put 99 at 5,000 hours: eleven
// weeks at that pace, and then nothing more to earn. The ask: quick early
// levels, each level slower than the last, a level that says mastery after
// about five months, and no ceiling.
//
// Measured against the pace in the report, 1,945 hours in 30 days (about 65
// agent hours a day): a month is the middle of the climb, five months is the
// edge of 99, and 99 is 10,000 hours.
import { describe, it, expect } from 'vitest';
import { levelFor, hoursForLevel, MASTERY_HOURS } from '../shared/agent-hours.mjs';

const PACE = 1945 / 30;
const SECOND = 1 / 3600;

describe('the reported pace', () => {
  it('a month of it is the middle of the climb, not 72', () => {
    expect(levelFor(1945)).toBe(51);
  });
  it('five months of it is just short of 99', () => {
    expect(levelFor(PACE * 152)).toBe(98);
  });
  it('a year of it is past 99, and two years is further still', () => {
    expect(levelFor(PACE * 365)).toBe(125);
    expect(levelFor(PACE * 730)).toBe(141);
  });
});

describe('99 is 10,000 hours', () => {
  it('reached at 10,000 and not a second before', () => {
    expect(MASTERY_HOURS).toBe(10000);
    expect(hoursForLevel(99)).toBe(10000);
    expect(levelFor(10000)).toBe(99);
    expect(levelFor(10000 - SECOND)).toBe(98);
  });
});

describe('early levels are quick', () => {
  it('level 2 comes in the first ten minutes', () => {
    expect(hoursForLevel(2) * 60).toBeLessThan(10);
    expect(levelFor(0)).toBe(1);
    expect(levelFor(10 / 60)).toBe(2);
  });
  it('a first hour, a 12-hour day, and a day at the reported pace', () => {
    expect(levelFor(1)).toBe(3);
    expect(levelFor(12)).toBe(7);
    expect(levelFor(PACE)).toBe(14);
  });
});

describe('every level costs more than the one before', () => {
  const cost = (L) => hoursForLevel(L + 1) - hoursForLevel(L);

  it('all the way up, across 99', () => {
    for (let L = 1; L < 300; L += 1) expect(cost(L + 1)).toBeGreaterThan(cost(L));
  });
  it('past 99 each level costs 5% more than the last', () => {
    for (const L of [99, 100, 120, 200]) expect(cost(L + 1) / cost(L)).toBeCloseTo(1.05, 9);
  });
});

describe('there is no ceiling', () => {
  it('more hours is always a higher level, however many', () => {
    expect(levelFor(20000)).toBeGreaterThan(levelFor(15000));
    expect(levelFor(1e6)).toBeGreaterThan(levelFor(1e5));
  });
});

describe('the level and its hours agree at every boundary', () => {
  // Up to 200, about 720,000 hours: past it one level costs over 35,000
  // hours, and a second is below what the level's arithmetic can tell apart.
  it('a level starts exactly at its hours and not a second before', () => {
    for (let L = 2; L <= 200; L += 1) {
      expect(levelFor(hoursForLevel(L))).toBe(L);
      expect(levelFor(hoursForLevel(L) - SECOND)).toBe(L - 1);
    }
  });
  it('level 1 needs nothing, and nothing below 1 exists', () => {
    expect(hoursForLevel(1)).toBe(0);
    expect(hoursForLevel(0)).toBe(0);
  });
});

describe('nonsense is nothing', () => {
  it('reads as level 1', () => {
    expect(levelFor(-5)).toBe(1);
    expect(levelFor(Number.NaN)).toBe(1);
    expect(levelFor(undefined)).toBe(1);
    expect(levelFor(Infinity)).toBe(1);
  });
});
