// THE MEMORY LOG READING SAYS WHO HELD THE MEMORY.
//
// What broke: on 2026-11-23 the question "was it Agentbox or something else"
// took five one-off scripts over a week of minute lines, and the answer was
// not the one assumed. Of 1,101 short minutes on a 16 GB Mac, Agentbox was
// over its allowance in 448; in 360 only other programs were big (a backup at
// 3 to 4 GB in most), and the app froze nine times in a hundred of those
// against forty-one in a hundred where Agentbox was. A count of short minutes
// alone had been read as Agentbox's doing for days.
//
// scripts/read-memory-log.mjs answers it for each day from the app's own
// logs. Its arithmetic is pinned here because a reading that adds up wrong
// sends the next fix after the wrong program.
import { describe, it, expect } from 'vitest';
import { summariseDay, causeOf } from '../scripts/read-memory-log.mjs';

const GB = 1024;
const RAM = 16 * GB;
const at = (minute: number) => new Date(Date.UTC(2026, 10, 22, 19, minute)).toISOString();
const line = (minute: number, pressure: string, { app = 1500, tasks = [] as [string, number, string][], others = [] as [string, number][], swapInMbps = 0, allowance = undefined as unknown } = {}) => ({
  at: at(minute), pressure, swapInMbps, running: tasks.length, measure: 'footprint',
  app: { mb: app, procs: 3, top: [] },
  tasks: tasks.map(([item, mb, program]) => ({ item, product: 'p', mb, procs: 2, top: [{ name: program, mb }] })),
  others: others.map(([name, mb]) => ({ name, mb })),
  ...(allowance ? { allowance } : {}),
});
const quiet = (minute: number, pressure: string) => ({ at: at(minute), pressure, measure: 'reading', running: 0 });

const TESTERS: [string, number, string][] = [['w-aaa', 3300, 'Google Chrome for Testing Helper'], ['w-bbb', 2300, 'claude']];
const USUAL: [string, number][] = [['Google Chrome Helper', 1200], ['WindowServer', 1000], ['Notion Helper', 800]];
// With the usual three, a backup at 4.2 GB takes the others past seven sixteenths.
const BACKUP: [string, number][] = [['bztransmit', 4200], ...USUAL];

describe('one minute', () => {
  it('is Agentbox when the app and its agents are over their allowance', () => {
    expect(causeOf(line(0, 'tight', { app: 4000, tasks: TESTERS, others: USUAL }), RAM)).toBe('agentbox');
  });

  it('is the other programs when they leave the allowance at its floor and the agents hold little', () => {
    expect(causeOf(line(0, 'tight', { app: 2300, tasks: [['w-ccc', 338, 'claude']], others: [['bztransmit', 4033], ['Google Chrome Helper', 1160], ['WindowServer', 1098], ['Superhuman Helper', 970], ['Notion Helper', 853]] }), RAM)).toBe('others');
  });

  it('is both when each is big', () => {
    expect(causeOf(line(0, 'critical', { app: 4000, tasks: TESTERS, others: BACKUP }), RAM)).toBe('both');
  });

  it('is neither when Agentbox is inside and the others are under seven sixteenths', () => {
    expect(causeOf(line(0, 'tight', { app: 1500, tasks: [['w-ccc', 300, 'claude']], others: USUAL }), RAM)).toBe('neither');
    // One megabyte under the line the others cross at 7 GB of 16.
    expect(causeOf(line(0, 'tight', { others: [['bztransmit', 7 * GB - 1]] }), RAM)).toBe('neither');
    expect(causeOf(line(0, 'tight', { others: [['bztransmit', 7 * GB]] }), RAM)).toBe('others');
  });

  it('takes the standing the app wrote on the line over working it out again', () => {
    const written = line(0, 'tight', { app: 1500, others: USUAL, allowance: { allowanceMb: 2048, agentboxMb: 9000, over: true } });
    expect(causeOf(written, RAM)).toBe('agentbox');
  });

  it('has no answer for a minute with no listing', () => {
    expect(causeOf(quiet(0, 'tight'), RAM)).toBe('unlisted');
  });
});

describe('one day', () => {
  const lines = [
    quiet(0, 'normal'),
    line(1, 'normal', { others: USUAL }),
    // Over before the kernel says so, then short.
    line(2, 'normal', { app: 4000, tasks: TESTERS, others: USUAL }),
    line(3, 'tight', { app: 4000, tasks: TESTERS, others: USUAL, swapInMbps: 6 }),
    line(4, 'critical', { app: 4000, tasks: TESTERS, others: BACKUP, swapInMbps: 40 }),
    // The testers end; only the backup is left.
    line(5, 'tight', { app: 2000, tasks: [['w-ccc', 300, 'claude']], others: BACKUP, swapInMbps: 5 }),
    line(6, 'tight', { app: 2000, tasks: [['w-ccc', 300, 'claude']], others: BACKUP }),
    line(7, 'tight', { app: 1500, others: USUAL }),
    quiet(8, 'tight'),
    // The recorder's heap lines share the file and are not minutes.
    { at: at(9), upMin: 30, heapMb: 200 },
  ];
  const freezes = [
    { at: at(1), ms: 600 },
    { at: at(3), ms: 2000 }, { at: at(3), ms: 1500 },
    { at: at(4), ms: 4000 },
    { at: at(6), ms: 700 },
  ];
  const day = summariseDay(lines, freezes, { ramMb: RAM });

  it('counts the minutes, the short ones and the swapping ones', () => {
    expect(day).toMatchObject({ minutes: 9, short: 6, critical: 1, swapping: 3 });
  });

  it('counts every minute over the allowance, and the ones before the kernel said short', () => {
    expect(day.over).toBe(3);
    expect(day.overBeforeShort).toBe(1);
  });

  it('splits the short minutes by who held the memory', () => {
    expect(day.causes).toEqual({ agentbox: 1, both: 1, others: 2, neither: 1, unlisted: 1 });
  });

  it('puts each freeze with the minute it fell in', () => {
    expect(day.freezeS).toEqual({ agentbox: 3.5, both: 4, others: 0.7, neither: 0, unlisted: 0, normal: 0.6 });
  });

  it('names the tasks and programs behind the minutes over the allowance, biggest first', () => {
    expect(day.tasks).toEqual([{ name: 'w-aaa', minutes: 3, meanMb: 3300 }, { name: 'w-bbb', minutes: 3, meanMb: 2300 }]);
    expect(day.programs[0]).toEqual({ name: 'Google Chrome for Testing Helper', minutes: 3, meanMb: 3300 });
  });

  it('names the other programs behind the short minutes that were theirs', () => {
    expect(day.others[0]).toEqual({ name: 'bztransmit', minutes: 3, meanMb: 4200 });
    expect(day.others.map((o) => o.name)).toContain('Google Chrome Helper');
  });

  it('a day with nothing short says so in noughts, not blanks', () => {
    const calm = summariseDay([line(1, 'normal', { others: USUAL }), quiet(2, 'normal')], [], { ramMb: RAM });
    expect(calm).toMatchObject({ minutes: 2, short: 0, over: 0, causes: { agentbox: 0, both: 0, others: 0, neither: 0, unlisted: 0 }, tasks: [], others: [] });
  });
});
