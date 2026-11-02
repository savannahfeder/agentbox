// TODAY NAMES EACH THING ONCE AND SAYS HOW FAR IT GOT.
//
// Maya, on Today:"FINISHED Set up its job" on every agent, rows with no
// word on how far along they are, "and 10 more" that left the page, the investor
// update under both WAITING ON YOU and DECIDED at the same 8:12am, and the right half
// of the window empty. Measured by reading what teamToday hands the page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { teamToday } from '../renderer/src/team/today.ts';

const now = new Date('2026-10-31T18:00:00').getTime();
const row = (id, over = {}) => ({ id, product: 'c', title: id, status: 'open', updatedAt: now - 1000, labels: [], ...over });
const day = (over) => teamToday({ range: 'today', now, me: 'me', items: [], products: [{ slug: 'c', name: 'Company' }], cards: [], decisions: [], needs: [], people: [], mates: [], mateOf: () => null, ...over });
const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('rows that say nothing', () => {
  it('an agent setting up its job is not news', () => {
    const d = day({ items: [row('w-1', { status: 'done', title: 'Set up its job' }), row('w-2', { status: 'done', title: 'Real work' })] });
    expect(d.people[0].finished.map((l) => l.item.id)).toEqual(['w-2']);
  });
  it('on a teammate\'s card too', () => {
    const card = (title) => ({ personId: 'dev', threadId: title, title, state: 'done', visible: true, updatedAt: now - 1, blockedBy: [] });
    expect(day({ people: [{ id: 'dev', name: 'Dev' }], cards: [card('Set up its job')] }).people).toEqual([]);
    expect(day({ people: [{ id: 'dev', name: 'Dev' }], cards: [card('Set up CI for the app')] }).people[0].finished).toHaveLength(1);
  });
  it('a real thread that starts with the word Setup stays', () => {
    const d = day({ items: [row('w-1', { status: 'done', title: 'Setup guide for clinics' })] });
    expect(d.people[0].finished).toHaveLength(1);
  });
});

describe('a thing both waiting and decided', () => {
  const approvals = [{ key: 'c\0o\0markdown', name: 'o.md', by: 'me', at: now - 500, threads: ['c/w-1'] }];
  it('shows once, as what still waits', () => {
    const d = day({ needs: [row('w-1', { title: 'October investor update' })], approvals });
    expect(d.people[0].waitingOnYou).toHaveLength(1);
    expect(d.people[0].decided).toEqual([]);
  });
  it('still shows as decided once it no longer waits', () => {
    expect(day({ approvals }).people[0].decided).toHaveLength(1);
  });
  it('an approval on another thread stays', () => {
    const d = day({ needs: [row('w-9')], approvals });
    expect(d.people[0].decided).toHaveLength(1);
  });
});

describe('how far a thing got', () => {
  it('a working row carries its own progress words', () => {
    const d = day({ items: [row('w-1', { progress: 'Two of five steps built' })] });
    expect(d.people[0].working[0].says).toBe('Two of five steps built');
  });
  it('a teammate\'s card too', () => {
    const d = day({ people: [{ id: 'dev', name: 'Dev' }], cards: [{ personId: 'dev', threadId: 't', title: 'Seats', state: 'running', visible: true, updatedAt: now - 1, blockedBy: [], progress: 'Tests pass, not merged' }] });
    expect(d.people[0].working[0].says).toBe('Tests pass, not merged');
  });
  it('a row with no words stays bare, and long words are cut', () => {
    expect(day({ items: [row('w-1')] }).people[0].working[0].says).toBeUndefined();
    const long = day({ items: [row('w-1', { progress: `${'word '.repeat(40)}` })] }).people[0].working[0].says;
    expect(long.length).toBeLessThanOrEqual(81);
    expect(long.endsWith('…')).toBe(true);
  });
  it('a trail of steps says only its latest step, not every step run together', () => {
    const says = (progress) => day({ items: [row('w-1', { progress })] }).people[0].working[0].says;
    expect(says('Drew three screens\nPicked the second with Maya')).toBe('Picked the second with Maya');
    expect(says('- Read the code\n✓ Drew the screens\n\n')).toBe('Drew the screens');
    expect(says('One step only')).toBe('One step only');
  });
});

describe('the page', () => {
  const page = read('renderer/src/team/TodayPage.tsx');
  it('unfolds "and N more" where it stands', () => {
    expect(page).toMatch(/setOpen\(true\)/);
    expect(page).not.toMatch(/onClick=\{onMore\}/);
  });
  it('draws what a row says', () => {
    expect(page).toContain('td-says');
  });
  it('uses the width', () => {
    const css = read('renderer/src/team/today.css');
    expect(css).not.toMatch(/\.td-col \{ max-width: 640px/);
    expect(css).toMatch(/\.td-people \{[^}]*columns:/);
    expect(css).toMatch(/\.td-person \{[^}]*break-inside: avoid/);
  });
});
