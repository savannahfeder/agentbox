// TODAY LISTS EVERY OPEN TASK ON THE TEAM, BY WHO HAS IT.
//
// Dev: "Board view
// exists ... only mine; no blocked by and no one else's tasks" and "wanted: one
// list: every task, who has it, what it waits on. This is why I still cannot
// drop Linear." Measured on the Today page before this: a task you gave sat
// under you as Blocked on its holder, a task someone gave you was left out, and
// a teammate's task between two other people never appeared, so no screen could
// answer "what is Sofia doing". Built here from the store's own shapes.
import { describe, it, expect } from 'vitest';
import { teamToday, linesToStep } from '../renderer/src/team/today.ts';
import { cardWait, personWait } from '../shared/thread-waits.mts';

const NOW = new Date(2026, 9, 31, 16, 0).getTime();
const at = (h, d = 0) => new Date(2026, 9, 31 + d, h, 0).getTime();
const products = [
  { slug: 'lumen', name: 'Lumen', team: {} },
  { slug: 'direct-dev', name: 'Dev', team: { direct: true } },
  { slug: 'direct-sofia', name: 'Sofia', team: { direct: true } },
];
const task = (o) => ({ status: 'open', labels: ['given-task'], updatedAt: at(9), createdAt: at(8), title: o.id, ...o });
const card = (o) => ({ visible: true, state: 'waiting', project: 'Task', blockedBy: [], blocks: [], people: null, priority: 5, problem: null, progress: null, solution: null, updatedAt: at(10), ...o });

const items = [
  task({ id: 'to-dev', product: 'direct-dev', title: 'Restyle the seat picker', assignee: 'p-dev', createdBy: 'p-me', people: ['p-me', 'p-dev'], due: '2026-10-30', priority: 9 }),
  task({ id: 'to-sofia', product: 'direct-sofia', title: 'Cut the launch film', assignee: 'p-sofia', createdBy: 'p-me', people: ['p-me', 'p-sofia'], blockedBy: [cardWait('p-dev', 'to-dev')] }),
  task({ id: 'from-dev', product: 'direct-dev', title: 'Read the pricing page', assignee: 'p-me', createdBy: 'p-dev', people: ['p-dev', 'p-me'], due: '2026-11-04' }),
  task({ id: 'done-one', product: 'direct-dev', title: 'Old', assignee: 'p-dev', createdBy: 'p-me', status: 'done', updatedAt: at(9, -2) }),
];
const cards = [
  // Dev's own copy of the task you gave him: the local row says it once.
  card({ personId: 'p-dev', threadId: 'to-dev', title: 'Restyle the seat picker', task: { from: 'p-me' } }),
  // A task between Dev and Sofia that you are not on.
  card({ personId: 'p-sofia', threadId: 'dev-to-sofia', title: 'Clinic email copy', task: { from: 'p-dev', dueAt: at(15), clock: true }, blockedBy: [{ id: personWait('p-dev'), title: null }] }),
  card({ personId: 'p-sofia', threadId: 'finished', title: 'Done thing', state: 'done', task: { from: 'p-dev' } }),
  // A task nobody let the team read, and a thread that is not a task.
  card({ personId: 'p-sofia', threadId: 'secret', title: null, project: null, priority: null }),
  card({ personId: 'p-dev', threadId: 'dev-thread', title: 'Render account setup', project: 'Lumen', state: 'running' }),
];
const base = {
  range: 'today', now: NOW, me: 'p-me', items, products, cards, decisions: [], needs: [],
  people: [{ id: 'p-dev', name: 'Dev Patel' }, { id: 'p-sofia', name: 'Sofia Ruiz' }],
  mates: [], mateOf: () => null,
};
const of = (day, key) => day.people.find((p) => p.key === key);
const said = (lines) => lines.map((l) => [l.title, l.due?.word ?? null, l.blocked ?? null, l.level ?? null]);

describe('each person\'s open tasks', () => {
  const day = teamToday(base);

  it('a task you gave is under whoever has it, with its due, block and level', () => {
    expect(said(of(day, 'person:p-dev').tasks)).toEqual([['Restyle the seat picker', '1 day late', null, 'Urgent']]);
    expect(said(of(day, 'person:p-sofia').tasks)).toEqual([
      ['Clinic email copy', '1 hour late', 'Dev', null],
      ['Cut the launch film', null, 'Dev’s “Restyle the seat picker”', null],
    ]);
  });

  it('a task someone gave you is under you, and says a day ahead', () => {
    expect(said(of(day, 'me').tasks)).toEqual([['Read the pricing page', 'Due Wed', null, null]]);
  });

  it('a task you gave is not also blocked under you', () => {
    expect(of(day, 'me').blocked).toEqual([]);
  });

  it('leaves out what is finished, what nobody may read, and threads that are not tasks', () => {
    const titles = day.people.flatMap((p) => p.tasks.map((l) => l.title));
    expect(titles).not.toContain('Done thing');
    expect(titles).not.toContain('Old');
    expect(titles).not.toContain('Render account setup');
    expect(titles).toHaveLength(4);
  });

  it('the late ones first', () => {
    const day2 = teamToday({ ...base, cards: [...cards, card({ personId: 'p-sofia', threadId: 'early', title: 'Due later', task: { from: 'p-dev', dueAt: at(18), clock: true }, updatedAt: at(12) })] });
    expect(of(day2, 'person:p-sofia').tasks.map((l) => l.title)).toEqual(['Clinic email copy', 'Due later', 'Cut the launch film']);
  });

  it('on yesterday and this week too, because a task is open now', () => {
    expect(of(teamToday({ ...base, range: 'yesterday' }), 'person:p-dev').tasks).toHaveLength(1);
  });
});

describe('said once', () => {
  it('a task in your Needs you is said as waiting on you, not again under Tasks', () => {
    const needs = [items[2]];
    const day = teamToday({ ...base, needs });
    expect(of(day, 'me')?.tasks ?? []).toEqual([]);
    expect(of(day, 'person:p-dev').waitingOnYou.map((l) => l.title)).toEqual(['Read the pricing page']);
  });

  it('J and K walk the tasks, a free one under To do and a blocked one under Blocked', () => {
    const ids = linesToStep(teamToday(base).people).map((s) => s.id);
    expect(ids).toContain('person:p-dev/todo/direct-dev/to-dev');
    expect(ids).toContain('person:p-sofia/blocked/card/p-sofia/dev-to-sofia');
  });

  it('the count of what is blocked on others takes blocked tasks', () => {
    expect(teamToday(base).counts.blocked).toBe(2);
  });
});
