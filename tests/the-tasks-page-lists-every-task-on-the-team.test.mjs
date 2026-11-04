// THE TASKS PAGE LISTS EVERY TASK ON THE TEAM, ONE ROW EACH.
//
// Dev: "Not Linear yet." Today listed titles under each person, the
// Team view mixed agent threads in with every row reading WAITING ON MAYA, and
// nothing said who gave a task, when it was due or what it waited on. His one
// change: "a Tasks page for the whole team, one row per task with who has it,
// who gave it, due, and blocked by what (a link to the blocking task), and no
// agent threads mixed in." Measured: no list in the app held a teammate's task
// between two other people beside the ones you hold and gave.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { teamTasks, tasksLine, tasksInOrder } from '../renderer/src/team/tasks.ts';

const ME = 'p-maya';
const DEV = 'p-dev';
const SOFIA = 'p-sofia';
const names = { [ME]: 'Maya', [DEV]: 'Dev', [SOFIA]: 'Sofia' };
const nameOf = (id) => names[id] ?? 'Someone';
// Sunday 1 November 2026, 9am.
const NOW = new Date(2026, 10, 1, 9, 0).getTime();
const H = 3_600_000;

const withDev = { slug: 'direct-dev', name: 'Dev', team: { projectId: 'x', direct: true, people: [ME, DEV] } };
const withSofia = { slug: 'direct-sofia', name: 'Sofia', team: { projectId: 'y', direct: true, people: [ME, SOFIA] } };
const lumen = { slug: 'lumen', name: 'Lumen', team: { projectId: 'z' } };
const products = [withDev, withSofia, lumen];

const task = (id, over = {}) => ({
  id, product: withDev.slug, title: id, labels: ['given-task'], assignee: DEV, people: [ME, DEV], createdBy: ME,
  status: 'open', createdAt: NOW - 5 * H, updatedAt: NOW - 2 * H, talk: { chat: [{ by: ME, ts: NOW - 5 * H, text: id }] }, wrote: {}, ...over,
});
const card = (threadId, over = {}) => ({
  personId: SOFIA, threadId, visible: true, title: threadId, project: 'Task', state: 'waiting', priority: null,
  problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: NOW - H,
  task: { from: DEV }, ...over,
});

const items = [
  task('Fix double booking', { blockedBy: ['name:Jordan’s answers'], wrote: { blockedBy: { by: DEV, ts: NOW - 3 * H, source: 'founder' } } }),
  task('Seat picker copy', { product: withSofia.slug, assignee: SOFIA, people: [ME, SOFIA], due: '2026-11-01T08:00' }),
  task('Investor update v6', { assignee: ME, createdBy: DEV, due: '2026-11-03' }),
  task('Decide which ships first', { status: 'done', wrote: { status: { by: DEV, ts: NOW - 20 * H } } }),
  task('Old closed one', { status: 'done', wrote: { status: { by: DEV, ts: NOW - 9 * 24 * H } } }),
  // Not tasks: an agent's thread, a thread in a project, a conversation.
  { id: 'agent1', product: 'lumen', title: 'Agent at work', agent: { id: 'a' }, labels: [], status: 'open', updatedAt: NOW },
  { id: 'th1', product: 'lumen', title: 'Group seat picker page', labels: [], status: 'open', updatedAt: NOW },
  { id: 'chat1', product: withDev.slug, title: 'Hey', labels: [], people: [ME, DEV], status: 'open', updatedAt: NOW },
];
const cards = [
  card('Low availability words', { blockedBy: [{ id: `card:${ME}:Investor update v6`, title: null }], task: { from: DEV, dueAt: new Date(2026, 10, 2, 15, 0).getTime(), clock: true } }),
  card('Kept between them', { title: null }),
  card('Seat picker copy', { personId: SOFIA }),
  card('Restyle onboarding', { personId: DEV, title: 'Restyle onboarding', task: undefined }),
];
const g = teamTasks({ items, products, cards, me: ME, now: NOW, nameOf });
const titles = (rows) => rows.map((r) => r.title);

describe('what is on it', () => {
  it('every open task: the ones you gave, the ones you hold, and ones between two others', () => {
    expect(titles(tasksInOrder(g, false)).sort()).toEqual(['Fix double booking', 'Investor update v6', 'Low availability words', 'Seat picker copy']);
  });
  it('no agent threads, no project threads, no conversations, and no task kept private', () => {
    const all = titles(tasksInOrder(g, true));
    for (const not of ['Agent at work', 'Group seat picker page', 'Hey', 'Restyle onboarding', 'Kept between them']) expect(all).not.toContain(not);
  });
  it('a task you are on and its holder\'s card for it is one row, not two', () => {
    expect(titles(tasksInOrder(g, true)).filter((t) => t === 'Seat picker copy')).toHaveLength(1);
  });
  it('done this week is kept apart, and last week is not on it', () => {
    expect(titles(g.done)).toEqual(['Decide which ships first']);
  });
});

describe('what each row says', () => {
  const row = (t) => tasksInOrder(g, true).find((r) => r.title === t);
  it('who has it and who gave it', () => {
    expect(row('Investor update v6')).toMatchObject({ holder: ME, giver: DEV });
    expect(row('Low availability words')).toMatchObject({ holder: SOFIA, giver: DEV });
  });
  it('a due with a time says it, ahead of the day too', () => {
    expect(row('Low availability words').due.word).toBe('Due tomorrow 3pm');
    expect(row('Investor update v6').due.word).toBe('Due Tue');
  });
  it('a time that has passed says how late', () => {
    expect(row('Seat picker copy').due).toMatchObject({ word: '1 hour late', late: true });
  });
  it('a block on someone outside the team names them', () => {
    expect(row('Fix double booking').block).toEqual({ on: 'Jordan’s answers' });
  });
  it('a block on a task opens that task', () => {
    const b = row('Low availability words').block;
    expect(b.on).toMatch(/Investor update v6/);
    expect(b.opens.item.id).toBe('Investor update v6');
  });
  it('a row with nothing blocking it says nothing about blocks', () => {
    expect(row('Investor update v6').block).toBeNull();
  });
});

describe('the order', () => {
  it('late first, then blocked, then the rest by when they are due', () => {
    expect(titles(g.late)).toEqual(['Seat picker copy']);
    expect(titles(g.blocked)).toEqual(['Low availability words', 'Fix double booking']);
    expect(titles(g.open)).toEqual(['Investor update v6']);
  });
  it('one line over it counts what is open, late and blocked', () => {
    expect(tasksLine(g)).toBe('4 open tasks, 1 late, 2 blocked');
    expect(tasksLine({ late: [], blocked: [], open: [], done: [] })).toBe('No open tasks on the team');
  });
});

it('Tasks is a tab beside Needs you, In progress and Today, one press from the inbox', () => {
  const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  expect(pages).toMatch(/team\.tasks\.onTasks/);
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/<TasksPage /);
});
