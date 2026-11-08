// Home (Alpha features): the greeting, the doors at its top and each
// teammate's week of finished work.
//
// What was asked for: the week's bars showed two empty days still to come,
// which say nothing; the bars are the last seven days ending today. Someone
// with no team gets no Team door. Measured on the pure rules Home draws from.
import { describe, it, expect } from 'vitest';
import { doors, engineLetter, greeting, teamRowState, weekCounts } from '../renderer/src/home/home-model.ts';

const at = (y, mo, d, h = 12) => new Date(y, mo - 1, d, h).getTime();
const now = at(2026, 11, 8, 15);

describe('the week ends today', () => {
  it('counts each of the last seven days, oldest first and today last', () => {
    const w = weekCounts([at(2026, 11, 8, 9), at(2026, 11, 8, 10), at(2026, 11, 2, 9), at(2026, 11, 5)], now);
    expect(w).toEqual([1, 0, 0, 1, 0, 0, 2]);
  });
  it('leaves out the day before the week and anything later than now', () => {
    expect(weekCounts([at(2026, 11, 1, 23), at(2026, 11, 8, 18)], now)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
  it('takes the first minute of the oldest day', () => {
    expect(weekCounts([new Date(2026, 10, 2, 0, 0).getTime()], now)[0]).toBe(1);
  });
});

describe('the doors', () => {
  it('has a Team door only for someone on a team', () => {
    expect(doors({ needs: 4, progress: 2, team: true }).map((d) => d.key)).toEqual(['inbox', 'progress', 'team']);
    expect(doors({ needs: 4, progress: 2, team: false }).map((d) => d.key)).toEqual(['inbox', 'progress']);
  });
  it('carries the counts and no count on Team', () => {
    const d = doors({ needs: 42, progress: 6, team: true });
    expect(d.map((x) => x.count)).toEqual([42, 6, null]);
  });
});

describe('the greeting', () => {
  it('says the part of the day with your first name', () => {
    expect(greeting(9, 'Maya Chen')).toBe('Good morning, Maya');
    expect(greeting(12, 'Maya Chen')).toBe('Good afternoon, Maya');
    expect(greeting(17, 'Maya')).toBe('Good afternoon, Maya');
    expect(greeting(18, 'Maya')).toBe('Good evening, Maya');
    expect(greeting(3, 'Maya')).toBe('Good evening, Maya');
    expect(greeting(4, 'Maya')).toBe('Good morning, Maya');
  });
  it('is the bare greeting when no name is known', () => {
    expect(greeting(14, null)).toBe('Good afternoon');
    expect(greeting(14, '  ')).toBe('Good afternoon');
  });
});

describe('a row says who it is from', () => {
  it('gives Codex its own letter so it reads apart from Claude Code', () => {
    expect(engineLetter('codex')).toBe('X');
    expect(engineLetter('claude')).toBe('C');
    expect(engineLetter(undefined)).toBe('C');
  });
  it('puts waiting on you ahead of working', () => {
    expect(teamRowState({ agents: 3, waitingOnYou: true })).toBe('waiting');
    expect(teamRowState({ agents: 3, waitingOnYou: false })).toBe('working');
    expect(teamRowState({ agents: 0, waitingOnYou: false })).toBe('quiet');
    expect(teamRowState({ agents: null, waitingOnYou: false })).toBe('quiet');
  });
});
