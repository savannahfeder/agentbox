// THE TASKS PAGE SAYS WHO IS DOING EACH TASK AND WHO ASKED FOR IT, IN WORDS.
//
// Asked on 2026-11-21, over a picture of the page: "What is it? What's it
// showing me? Is it just my tasks or something?" Each row named only who gave
// the task ("from Lena"). Who was doing it was a 20px photo with no name, so
// "Screenshots for the launch email, from Lena" read as Lena's task when Priya
// had it. Measured on the demo team: of its four rows, none named the person
// doing the task in words, and the one line over them never said the list was
// the whole team's.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TasksPage } from '../renderer/src/team/TasksPage.tsx';
import { tasksLine, type TaskGroups, type TaskRow } from '../renderer/src/team/tasks.ts';

const ME = 'p-jamie';
const names: Record<string, string> = { [ME]: 'Jamie', 'p-priya': 'Priya', 'p-lena': 'Lena', 'p-theo': 'Theo' };
const nameOf = (id: string) => names[id] ?? 'Someone';
const row = (title: string, holder: string | null, giver: string | null, over: Partial<TaskRow> = {}): TaskRow => ({
  key: title, title, holder, giver, due: null, block: null, unread: false, done: false, at: 0, ...over,
});
const noop = () => {};
const drawn = (groups: TaskGroups) => renderToStaticMarkup(createElement(TasksPage, {
  groups, faces: new Map(), nameOf, me: ME, picked: null, onPicked: noop, keys: false, onOpen: noop, onOpenBlock: noop, onDone: noop,
}));
const text = (html: string) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
// One row's cells as read left to right.
const cellsOf = (html: string, title: string) => {
  const at = html.indexOf(`data-key="${title}"`);
  const end = html.indexOf('</li>', at);
  return text(html.slice(html.indexOf('>', at) + 1, end)).split('|').map((s) => s.trim()).filter(Boolean);
};

const groups: TaskGroups = {
  late: [row('Screenshots for the launch email', 'p-priya', 'p-lena', { due: { word: '1 day late', late: true, at: 1 } })],
  blocked: [row('Pricing page for the per-seat plan', 'p-lena', ME, { block: { on: 'you' }, due: { word: 'Due tomorrow', late: false, at: 2 } })],
  open: [
    row('Approve the words on the sign-up screens', ME, 'p-priya', { due: { word: 'Due today', late: false, at: 3 } }),
    row('A task nobody gave', 'p-theo', null),
  ],
  done: [],
};
const html = drawn(groups);

describe('each row names both people', () => {
  it('a task between two teammates: who is doing it, then who asked', () => {
    expect(cellsOf(html, 'Screenshots for the launch email')).toEqual(['Screenshots for the launch email', 'Priya', 'Lena', '1 day late']);
  });
  it('a task you asked for says You under Asked by', () => {
    expect(cellsOf(html, 'Pricing page for the per-seat plan')).toEqual(['Pricing page for the per-seat plan', 'Blocked on', 'you', 'Lena', 'You', 'Due tomorrow']);
  });
  it('a task you are doing says You under Doing it', () => {
    expect(cellsOf(html, 'Approve the words on the sign-up screens')).toEqual(['Approve the words on the sign-up screens', 'You', 'Priya', 'Due today']);
  });
  it('a task with no giver leaves Asked by empty rather than guessing a name', () => {
    expect(cellsOf(html, 'A task nobody gave')).toEqual(['A task nobody gave', 'Theo']);
  });
  it('the old "from Lena" wording is gone', () => {
    expect(text(html)).not.toMatch(/\bfrom (Lena|Priya|you)\b/);
  });
});

describe('the columns', () => {
  it('are named once, over every row', () => {
    const head = text(html.slice(0, html.indexOf('data-key=')));
    expect(head).toMatch(/\|Task\|Doing it\|Asked by\|Due\|/);
    expect(html.match(/Doing it/g)).toHaveLength(1);
  });
  it('are not drawn over an empty page', () => {
    const empty = drawn({ late: [], blocked: [], open: [], done: [] });
    expect(empty).not.toContain('Doing it');
    expect(text(empty)).toContain('No open tasks on the team');
  });
  it('keep late first, then blocked, then the rest', () => {
    const order = [...html.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['Screenshots for the launch email', 'Pricing page for the per-seat plan', 'Approve the words on the sign-up screens', 'A task nobody gave']);
  });
});

describe('the line over the page says it is the whole team', () => {
  it('counts open tasks on the team, then late and blocked', () => {
    expect(tasksLine(groups)).toBe('4 open tasks on the team, 1 late, 1 blocked');
  });
  it('one task is one task', () => {
    expect(tasksLine({ late: [], blocked: [], open: [row('One', ME, ME)], done: [] })).toBe('1 open task on the team');
  });
});
