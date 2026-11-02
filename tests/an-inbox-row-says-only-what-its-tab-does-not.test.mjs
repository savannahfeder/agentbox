// AN INBOX ROW SAYS ONLY WHAT ITS TAB DOES NOT.
//
// "Extra unnecessary text in random areas... too cluttered to understand",
// using the team version on 2026-11-01. Seen on the photo stage at 1440x900:
// every agent row under NEEDS YOU read WAITING ON YOU, which is the tab's own
// name; every row read MEDIUM, the level a thread has when nobody set one; and
// a person's task or message put TASK or MESSAGE in the PROJECT column, which
// is a kind, not a project. Under IN PROGRESS a row with no agent read "In
// progress", the tab again.
//
// Now the cell is left empty in each of those cases and the five cells stay,
// so the columns still line up.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { FleetContext } from '../renderer/src/fleet.ts';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.parse('2026-11-01T10:00:00Z');
const MIN = 60_000;
const ME = 'p-maya', SOFIA = 'p-sofia';
const NAMES = { [ME]: 'Maya Chen', [SOFIA]: 'Sofia Ruiz' };
const team = { state: { signedIn: true, cards: [] }, me: ME, byId: new Map(Object.entries(NAMES).map(([id, name]) => [id, { id, name }])), products: new Map() };

const company = { slug: 'company', name: 'Company' };
const withSofia = { slug: 'direct-sofia', name: 'Sofia', team: { projectId: 'd', direct: true, people: [ME, SOFIA] } };

const thread = (over = {}) => ({
  id: 'w-1', product: 'company', productName: 'Company', status: 'open', kind: 'question', title: 'Draft the October investor update',
  note: 'Two ways to do it.', labels: ['founder'], priority: 5, claim: null, createdAt: NOW - 3 * MIN, updatedAt: NOW - 3 * MIN, ...over,
});
const task = (over = {}) => ({
  id: 'w-2', product: withSofia.slug, status: 'open', kind: 'directive', title: 'Review the launch film cut', body: 'Review the launch film cut',
  labels: ['given-task'], assignee: ME, people: [ME, SOFIA], createdBy: SOFIA, priority: 5,
  createdAt: NOW - MIN, updatedAt: NOW - MIN, talk: { chat: [{ by: SOFIA, ts: NOW - MIN, text: 'Review the launch film cut' }] }, wrote: {}, ...over,
});
const message = (over = {}) => ({
  id: 'w-3', product: withSofia.slug, status: 'open', kind: 'directive', title: 'Is the cut ready?', body: 'Is the cut ready?',
  labels: [], people: [ME, SOFIA], createdBy: SOFIA, priority: 5, createdAt: NOW - MIN, updatedAt: NOW - MIN,
  wrote: { body: { ts: NOW - MIN, by: SOFIA } }, ...over,
});

const draw = (item, product, tab, fleet = { queued: [] }) => renderToStaticMarkup(
  React.createElement(TeamContext.Provider, { value: team },
    React.createElement(FleetContext.Provider, { value: fleet },
      React.createElement(ThreadCells, { item, product, now: NOW, tab }))));
// The text inside one cell, tags removed.
const cell = (html, name) => {
  const at = html.indexOf(`th-cell-${name}`);
  const next = html.indexOf('<div class="th-cell-', at + 1);
  return html.slice(html.indexOf('>', at) + 1, next < 0 ? undefined : next).replace(/<[^>]+>/g, '').trim();
};
const cells = (html) => html.match(/<div class="th-cell-[a-z]+/g);
const FIVE = ['<div class="th-cell-title', '<div class="th-cell-state', '<div class="th-cell-proj', '<div class="th-cell-prio', '<div class="th-cell-when'];

describe('in Needs you', () => {
  it('an agent row says nothing in Status where it would only say Waiting on you', () => {
    const html = draw(thread(), company, 'inbox');
    expect(html).not.toContain('Waiting on you');
    expect(cell(html, 'state')).toBe('');
    expect(cells(html)).toEqual(FIVE);
  });

  it('a task still says who it is from', () => {
    expect(cell(draw(task(), withSofia, 'inbox'), 'state')).toBe('From Sofia');
  });

  it('a row an agent is asking on still says Asking', () => {
    const html = draw(thread(), company, 'inbox', { queued: [], asking: ['w-1'], sessions: new Map([['w-1', { itemId: 'w-1', startedAt: NOW - MIN, tail: [] }]]) });
    expect(cell(html, 'state')).not.toBe('');
    expect(cell(html, 'state')).not.toBe('Waiting on you');
  });
});

describe('the Project column', () => {
  it('keeps the project on a thread', () => {
    expect(cell(draw(thread(), company, 'inbox'), 'proj')).toBe('Company');
  });

  it('is empty on a task, never "Task"', () => {
    const html = draw(task(), withSofia, 'inbox');
    expect(cell(html, 'proj')).toBe('');
    expect(cells(html)).toEqual(FIVE);
  });

  it('is empty on a message, never "Message"', () => {
    const html = draw(message(), withSofia, 'inbox');
    expect(cell(html, 'proj')).toBe('');
    expect(cells(html)).toEqual(FIVE);
  });
});

describe('the Priority column', () => {
  it('is empty at Medium, the level nobody set', () => {
    const html = draw(thread({ priority: 5 }), company, 'inbox');
    expect(cell(html, 'prio')).toBe('');
    expect(cells(html)).toEqual(FIVE);
  });

  it('is empty on an untagged thread, which runs at Medium', () => {
    expect(cell(draw(thread({ priority: null }), company, 'inbox'), 'prio')).toBe('');
  });

  it.each([[9, 'Urgent'], [7, 'High'], [2, 'Low']])('still says a level somebody set: %i is %s', (priority, word) => {
    expect(cell(draw(thread({ priority }), company, 'inbox'), 'prio')).toBe(word);
  });

  it('just either side of Medium still shows', () => {
    expect(cell(draw(thread({ priority: 7 }), company, 'inbox'), 'prio')).toBe('High');
    expect(cell(draw(thread({ priority: 2 }), company, 'inbox'), 'prio')).toBe('Low');
    expect(cell(draw(thread({ priority: 6 }), company, 'inbox'), 'prio')).toBe('');
    expect(cell(draw(thread({ priority: 3 }), company, 'inbox'), 'prio')).toBe('');
  });
});

describe('in In progress', () => {
  const running = (over = {}) => thread({ kind: 'task', note: undefined, ...over });

  it('a row says nothing in Status where it would only say In progress', () => {
    // A fleet not yet read: the word falls back to the thread's own state.
    const html = draw(running(), company, 'progress', {});
    expect(html).not.toContain('In progress');
    expect(cell(html, 'state')).toBe('');
  });

  it('still says Working or Queued, which the tab does not', () => {
    expect(cell(draw(running(), company, 'progress', { queued: ['w-1'] }), 'state')).toBe('Queued');
    expect(cell(draw(running(), company, 'progress', { queued: [], sessions: new Map([['w-1', { itemId: 'w-1', startedAt: NOW - MIN, tail: [] }]]) }), 'state')).toBe('Working');
  });

  it('a task still says who has it', () => {
    const given = task({ assignee: SOFIA, createdBy: ME, talk: { chat: [{ by: ME, ts: NOW - MIN, text: 'Fix it' }] } });
    expect(cell(draw(given, withSofia, 'progress'), 'state')).toBe('With Sofia');
  });
});
