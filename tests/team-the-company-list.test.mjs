// THE TEAM PAGE IS THE STATE OF THE COMPANY: EVERY OPEN TASK, ONE LINE EACH.
//
// Approved 2026-09-30 (w-e731ca9376) after two rounds: not grouped by project
// ("there could be 200 tasks in any project"), not one line per person, but
// every open task in the company, newest movement first, filterable by state
// and by person. A teammate's private task is a blank line: who and what
// state, never its title or project. These pin the list the page draws
// (renderer/src/team/company.ts), plus the row end's due-day words and who a
// row is from.
import { it, expect, describe } from 'vitest';
import { companyLines, dueWords, sentFrom, movedAgo } from '../renderer/src/team/company.ts';

const ME = 'p-me', MAYA = 'p-maya', THEO = 'p-theo';
const shared = { slug: 'site', name: 'Website', team: { projectId: 'x', sharedBy: ME } };
const home = { slug: 'home', name: 'Personal', team: null };
const team = {
  configured: true, signedIn: true, me: { id: ME, name: 'Sam Rivera' }, team: { id: 't', name: 'Northwind' },
  people: [{ id: ME, name: 'Sam Rivera' }, { id: MAYA, name: 'Maya Chen' }, { id: THEO, name: 'Theo Park' }],
  activity: [{ personId: MAYA, taskKey: 'k1', state: 'run', movedAt: 500 }, { personId: ME, taskKey: 'k-mine', state: 'run', movedAt: 600 }],
  lastSyncAt: 0, error: null,
};
const row = (id, product, extra = {}) => ({ id, product, productName: product, title: id, status: 'open', claim: null, updatedAt: 100, createdAt: 1, ...extra });

describe('the company list', () => {
  const NOW = 1_000_000;
  const items = [
    row('mayas-agent', 'site', { createdBy: MAYA, status: 'claimed', claim: { holder: 'h', leaseUntil: NOW + 1 }, updatedAt: 900 }),
    row('given-to-theo', 'site', { createdBy: ME, assignee: THEO, updatedAt: 800 }),
    row('my-private', 'home', { updatedAt: 700 }),
    row('later', 'site', { createdBy: ME, runAt: NOW + 3_600_000, updatedAt: 400 }),
    row('finished', 'site', { createdBy: ME, status: 'done', updatedAt: NOW - 10 }),
  ];
  const { open, doneToday } = companyLines(items, [shared, home], team, NOW);

  it('lists every open task, newest movement first, not grouped', () => {
    expect(open.map((l) => l.key)).toEqual(['site/mayas-agent', 'site/given-to-theo', 'home/my-private', 'private/p-maya/k1', 'site/later']);
  });

  it('says who each task is with and what it is doing', () => {
    const by = Object.fromEntries(open.map((l) => [l.key, `${l.owner} ${l.state} ${l.stateText}`]));
    expect(by['site/mayas-agent']).toBe('p-maya run Running');
    expect(by['site/given-to-theo']).toBe('p-theo wait Waiting on Theo');
    expect(by['home/my-private']).toBe('p-me wait Waiting on you');
    expect(by['site/later']).toMatch(/^p-me sched Starts /);
  });

  it('shows a teammate\'s private task with no title and no project', () => {
    const blank = open.find((l) => l.key === 'private/p-maya/k1');
    expect(blank).toMatchObject({ title: null, project: '', owner: MAYA, state: 'run', item: null });
  });

  it('shows your own private task with its title, marked as yours', () => {
    expect(open.find((l) => l.key === 'home/my-private')).toMatchObject({ title: 'my-private', mine: true });
  });

  it('does not repeat your own private work as a blank line', () => {
    expect(open.some((l) => l.key === 'private/p-me/k-mine')).toBe(false);
  });

  it('keeps what finished today apart from what is open', () => {
    expect(doneToday.map((l) => l.key)).toEqual(['site/finished']);
  });
});

describe('due days', () => {
  const now = new Date(2026, 9, 1, 15, 0); // Thu 1 Oct 2026
  it('reads today, tomorrow, a weekday this week, and a date further out', () => {
    expect(dueWords('2026-10-01', now)).toBe('Due today');
    expect(dueWords('2026-10-02', now)).toBe('Due tomorrow');
    expect(dueWords('2026-10-05', now)).toMatch(/^Due Mon/);
    expect(dueWords('2026-10-14', now)).toMatch(/^Due Oct 14/);
  });
  it('says overdue for a day that has passed, and nothing for none', () => {
    expect(dueWords('2026-09-28', now)).toMatch(/^Overdue Sep 28/);
    expect(dueWords('none', now)).toBeNull();
    expect(dueWords(undefined, now)).toBeNull();
  });
});

describe('who a row is from', () => {
  it('is the teammate who gave it to you', () => {
    expect(sentFrom({ assignee: ME, people: [MAYA, ME], createdBy: MAYA }, shared, ME)).toEqual({ from: MAYA, agent: false });
  });
  it('is the teammate whose agent is asking', () => {
    expect(sentFrom({ createdBy: THEO }, shared, ME)).toEqual({ from: THEO, agent: true });
  });
  it('is nobody on your own row, or in a private project', () => {
    expect(sentFrom({ createdBy: ME }, shared, ME)).toBeNull();
    expect(sentFrom({ createdBy: MAYA }, home, ME)).toBeNull();
  });
});

describe('how long since a task moved', () => {
  it('says now for under a minute, then minutes, hours and days', () => {
    expect(movedAgo(20_000)).toBe('now');
    expect(movedAgo(5 * 60_000)).toBe('5m');
    expect(movedAgo(3 * 3_600_000)).toBe('3h');
    expect(movedAgo(2 * 86_400_000)).toBe('2d');
  });
});
