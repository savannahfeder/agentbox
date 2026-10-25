// A ROOM'S BOARD IS ONE LINE A THREAD, WITH WHOSE IT IS (w-49cd37092c, round four).
//
// The room's board was the Inbox board: a boxed card per thread with its
// project, so a room of eight ran off the screen. Of four sketches, the slim
// lists under "Running now" were the one asked for: one line, the title and a
// face, no project. Two things were wrong with them: a face of two letters did
// not say who, and In progress sat apart in a band of its own. Here every
// column, In progress included, is that one line, and it names the person.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomBoard } from '../renderer/src/team/rooms/RoomBoard.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.parse('2026-10-21T15:00:00Z');
const sam = { id: 'p-sam', name: 'Sam Rivera', email: 'sam@example.test', avatarUrl: null };
const maya = { id: 'p-maya', name: 'Maya Chen', email: 'maya@example.test', avatarUrl: null };
const products = [{ slug: 'checkout', name: 'Checkout' }];
const display = { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any', privacy: 'any' };
const card = (threadId, title, state) => ({
  personId: maya.id, threadId, visible: true, title, project: 'Checkout', state, priority: null, problem: null, progress: null, solution: null,
  blockedBy: [], blocks: [], people: null, updatedAt: NOW - 60_000,
});
const mine = { id: 'w-1', product: 'checkout', title: 'Pricing page copy', body: '', status: 'open', labels: [], createdAt: NOW - 600_000, updatedAt: NOW - 60_000 };

const draw = (props = {}) => renderToStaticMarkup(React.createElement(TeamContext.Provider, {
  value: { state: { since: null }, me: sam.id, byId: new Map([[sam.id, sam], [maya.id, maya]]), products: new Map() },
}, React.createElement(RoomBoard, {
  items: [mine], products, display, now: NOW, stateOf: () => 'waiting',
  cards: [card('m1', 'Stripe webhook retries', 'running'), card('m2', 'Tax line on invoices', 'done')],
  picked: [sam.id, maya.id], onOpenItem: () => {}, onOpenCard: () => {}, ...props,
})));

const columns = (html) => [...html.matchAll(/class="rm-bcol"[\s\S]*?class="th-col-h">([\s\S]*?)<b>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));

describe('a room’s board', () => {
  it('has In progress among its columns, in your order', () => {
    expect(columns(draw({ later: true }))).toEqual(['Waiting', 'In progress', 'Later', 'Done today']);
    expect(columns(draw({ later: true, columnOrder: ['running', 'waiting', 'scheduled', 'done'] }))).toEqual(['In progress', 'Waiting', 'Later', 'Done today']);
  });

  it('draws each thread with whose it is by name', () => {
    const html = draw();
    expect(html).toMatch(/class="rm-brow running"[\s\S]*?class="who">Maya<\/span><span class="t">Stripe webhook retries/);
    expect(html).toMatch(/class="rm-brow waiting"[\s\S]*?class="who">You<\/span><span class="t">Pricing page copy/);
  });

  it('shows no project and no card boxes', () => {
    const html = draw();
    expect(html).not.toContain('Checkout');
    expect(html).not.toContain('th-card');
  });

  it('dims what is done today', () => {
    expect(draw()).toMatch(/class="rm-brow done"[\s\S]*?Tax line on invoices/);
  });

  it('says so when a column is empty', () => {
    expect(draw({ later: true })).toMatch(/Later[\s\S]*?Nothing here\./);
  });

  it('leaves out a teammate who is not picked', () => {
    expect(draw({ picked: [sam.id] })).not.toContain('Stripe webhook retries');
  });
});

// A person's page once drew the Inbox's board for that one person through the
// same renderBoard. It shows no threads now (w-0bc0443617).
describe('wired into the room', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  it('the room’s Board view draws the room board, not the Inbox’s cards', () => {
    expect(app).toMatch(/renderBoard: \(people, \{ later \}\) => <RoomBoard /);
  });
  it('a person’s page is handed no board at all', () => {
    expect(app).not.toContain('renderPersonBoard');
    expect(hook).not.toContain('renderPersonBoard');
  });
});
