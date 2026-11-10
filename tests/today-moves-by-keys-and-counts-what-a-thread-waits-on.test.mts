// TODAY MOVES BY KEYS, AND COUNTS WHAT A THREAD WAITS ON.
//
// The team's test rounds found two things on the Today page. J and K did nothing
// there, though they move every other list: nothing in App's key handler or
// TodayPage knew its lines. And a thread set to "Waits on Dev" never read as
// blocked: measured by feeding teamToday a row with blockedBy ['person:p-dev'],
// the page looked the id up as a thread id, found no owner and dropped the line.
// Only a bare thread id ever counted.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { teamToday, linesToStep, stepLine } from '../renderer/src/team/today.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const NOW = new Date(2026, 9, 31, 15, 0).getTime();
const AT = new Date(2026, 9, 31, 9, 0).getTime();
const item = (o) => ({ product: 'lumen', status: 'open', labels: [], updatedAt: AT, createdAt: AT, title: o.id, ...o });
const card = (o) => ({ visible: true, state: 'waiting', project: 'Lumen', blockedBy: [], blocks: [], updatedAt: AT, ...o });
const base = {
  range: 'today', now: NOW, me: 'p-me', products: [{ slug: 'lumen', name: 'Lumen', team: {} }], decisions: [], needs: [], cards: [], items: [],
  people: [{ id: 'p-dev', name: 'Dev Patel' }, { id: 'p-sofia', name: 'Sofia Ruiz' }],
  mates: [{ id: 't-cos', name: 'Chief of staff' }], mateOf: () => null,
};
const blockedOn = (day, key) => day.people.find((p) => p.key === key)?.blocked.map((l) => [l.title, l.on]) ?? [];

describe('a blocked line comes from Waits on as well as blockedBy', () => {
  it('my thread that waits on a person says on whom', () => {
    const day = teamToday({ ...base, items: [item({ id: 'a', title: 'Go-live', blockedBy: ['person:p-dev'] })] });
    expect(blockedOn(day, 'me')).toEqual([['Go-live', 'Dev']]);
  });
  it('my thread that waits on a teammate\'s thread names its owner', () => {
    const day = teamToday({ ...base, items: [item({ id: 'a', title: 'Go-live', blockedBy: ['card:p-sofia:s1'] })] });
    expect(blockedOn(day, 'me')).toEqual([['Go-live', 'Sofia']]);
  });
  it('a teammate\'s card that waits on a person says so, and on me reads as you', () => {
    const day = teamToday({ ...base, cards: [
      card({ personId: 'p-dev', threadId: 'd1', title: 'Render', blockedBy: [{ id: 'person:p-sofia', title: null }] }),
      card({ personId: 'p-dev', threadId: 'd2', title: 'DNS', blockedBy: [{ id: 'person:p-me', title: null }] }),
    ] });
    expect(blockedOn(day, 'person:p-dev')).toEqual(expect.arrayContaining([['Render', 'Sofia'], ['DNS', 'you']]));
  });
  it('a bare thread id still counts, as it did', () => {
    const day = teamToday({ ...base, cards: [card({ personId: 'p-dev', threadId: 'd1', title: 'Render' })], items: [item({ id: 'a', title: 'Go-live', blockedBy: ['d1'] })] });
    expect(blockedOn(day, 'me')).toEqual([['Go-live', 'Dev']]);
  });
  it('someone nobody knows, and waiting on your own thread, make no line', () => {
    const day = teamToday({ ...base, items: [
      item({ id: 'a', title: 'Left', blockedBy: ['person:p-gone'] }),
      item({ id: 'b', title: 'Mine', blockedBy: ['c'] }),
      item({ id: 'c', title: 'Mine too' }),
    ] });
    expect(blockedOn(day, 'me')).toEqual([]);
  });
  it('a finished thread that once waited is finished, not blocked', () => {
    const day = teamToday({ ...base, items: [item({ id: 'a', title: 'Done', status: 'done', blockedBy: ['person:p-dev'] })] });
    expect(blockedOn(day, 'me')).toEqual([]);
  });
});

describe('J and K move through the lines the page draws', () => {
  const line = (key) => ({ key, title: key, at: AT });
  const person = (key, o) => ({ key, name: key, kind: 'person', finished: [], shipped: [], decided: [], blocked: [], waitingOnYou: [], working: [], privateDone: 0, ...o });
  const people = [
    person('a', { finished: [line('f1')], waitingOnYou: [line('w1')] }),
    person('b', { blocked: [line('b1')], shipped: [line('s1'), line('s2'), line('s3'), line('s4'), line('s5')] }),
  ];
  const lines = linesToStep(people);
  const ids = lines.map((l) => l.line.key);

  it('go in the order they read, person by person, and stop at what the section draws', () => {
    expect(ids).toEqual(['f1', 's1', 's2', 's3', 's4', 'b1']);
  });
  it('J from nothing takes the first, K from nothing too', () => {
    expect(stepLine(lines, null, 1)).toBe(lines[0].id);
    expect(stepLine(lines, null, -1)).toBe(lines[0].id);
  });
  it('step one line, and stay at either end', () => {
    expect(stepLine(lines, lines[1].id, 1)).toBe(lines[2].id);
    expect(stepLine(lines, lines[1].id, -1)).toBe(lines[0].id);
    expect(stepLine(lines, lines[0].id, -1)).toBe(lines[0].id);
    expect(stepLine(lines, lines[5].id, 1)).toBe(lines[5].id);
  });
  it('a picked line that has gone starts again from the first', () => {
    expect(stepLine(lines, 'gone', 1)).toBe(lines[0].id);
  });
  it('an empty page has nothing to pick', () => {
    expect(stepLine([], null, 1)).toBeNull();
  });
  it('what waits on you is not a stop: Needs you holds it', () => {
    expect(linesToStep([person('a', { waitingOnYou: [line('x')] })])).toEqual([]);
  });
});

describe('the wiring', () => {
  const page = read('renderer/src/team/TodayPage.tsx');
  it('the page takes the keys first, only while nothing is over it', () => {
    expect(page).toMatch(/addEventListener\('keydown', [a-z]+, true\)/);
    expect(page).toMatch(/if \(!keys\) return/);
    expect(read('renderer/src/App.tsx')).toMatch(/<TodayPage [^>]*keys=\{!modal\}/);
  });
  it('Enter opens the line the keys are on', () => {
    expect(page).toMatch(/e\.key === 'Enter'/);
    expect(page).toMatch(/onOpen\(/);
  });
});
