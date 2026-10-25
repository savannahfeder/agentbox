// A ROOM'S BOARD LEAVES LATER OFF UNTIL YOU ASK FOR IT (w-49cd37092c, round six).
//
// Four columns beside the chat left a title about 140px in a 1440 window, and
// real thread names are longer than that: the 22 open threads on this project
// measured a median of 34 characters and a longest of 50. Later was the column
// that mattered least, so it is off unless the View menu's Show line turns it
// on, and the other three share its width.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomBoard } from '../renderer/src/team/rooms/RoomBoard.tsx';
import { RoomViewButton, RoomViewMenu } from '../renderer/src/team/rooms/RoomView.tsx';
import { readBoardLater, writeBoardLater } from '../renderer/src/team/rooms/room-rules.ts';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.parse('2026-10-21T15:00:00Z');
const sam = { id: 'p-sam', name: 'Sam Rivera', email: 'sam@example.test', avatarUrl: null };
const maya = { id: 'p-maya', name: 'Maya Chen', email: 'maya@example.test', avatarUrl: null };
const display = { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any', privacy: 'any' };
const card = (threadId, title, state) => ({
  personId: maya.id, threadId, visible: true, title, project: 'Checkout', state, priority: null, problem: null, progress: null, solution: null,
  blockedBy: [], blocks: [], people: null, updatedAt: NOW - 60_000,
});

const draw = (props = {}) => renderToStaticMarkup(React.createElement(TeamContext.Provider, {
  value: { state: { since: null }, me: sam.id, byId: new Map([[sam.id, sam], [maya.id, maya]]), products: new Map() },
}, React.createElement(RoomBoard, {
  items: [], products: [], display, now: NOW,
  cards: [card('m1', 'Stripe webhook retries', 'running'), card('m2', 'App Store screenshots', 'scheduled')],
  picked: [sam.id, maya.id], onOpenItem: () => {}, onOpenCard: () => {}, ...props,
})));
const columns = (html) => [...html.matchAll(/class="rm-bcol"[\s\S]*?class="th-col-h">([\s\S]*?)<b>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));

describe('the room’s board without Later', () => {
  it('has three columns and none of Later’s threads', () => {
    const html = draw();
    expect(columns(html)).toEqual(['Waiting', 'In progress', 'Done today']);
    expect(html).not.toContain('App Store screenshots');
    expect(html).toContain('--cols:3');
  });
  it('keeps your order of the three', () => {
    expect(columns(draw({ columnOrder: ['done', 'scheduled', 'running', 'waiting'] }))).toEqual(['Done today', 'In progress', 'Waiting']);
  });
});

describe('the room’s board with Later', () => {
  it('has all four columns, Later where your order puts it', () => {
    const html = draw({ later: true });
    expect(columns(html)).toEqual(['Waiting', 'In progress', 'Later', 'Done today']);
    expect(html).toContain('App Store screenshots');
    expect(html).toContain('--cols:4');
  });
});

describe('whether Later is shown, remembered', () => {
  const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
  it('is off until you turn it on, and off again when you turn it off', () => {
    const store = memory();
    expect(readBoardLater(store)).toBe(false);
    writeBoardLater(true, store);
    expect(readBoardLater(store)).toBe(true);
    writeBoardLater(false, store);
    expect(readBoardLater(store)).toBe(false);
  });
  it('reads anything else it finds as off', () => {
    const store = memory();
    store.setItem('rooms.board.later', 'yes');
    expect(readBoardLater(store)).toBe(false);
    expect(readBoardLater(null)).toBe(false);
  });
});

describe('the View menu’s Show line', () => {
  const me = { id: 'sam', me: true, name: 'Sam', avatarUrl: null, teammate: false, showActivity: true };
  const her = { id: 'maya', me: false, name: 'Maya', avatarUrl: null, teammate: true, showActivity: true };
  const props = (_view, later) => ({ people: [me, her], picked: ['sam', 'maya'], onPick: () => {}, unseen: 0, later, onLater: () => {} });
  const menu = (view, later) => renderToStaticMarkup(React.createElement(RoomViewMenu, props(view, later)));
  const chip = (html) => html.match(/<span class="lab">Show<\/span><span class="opts">(<button[^>]*>[\s\S]*?<\/button>)/)?.[1] ?? '';
  it('offers Later on the board, not lit while it is off', () => {
    const html = menu('board', false);
    expect(chip(html)).toContain('Later');
    expect(chip(html)).toContain('aria-pressed="false"');
    expect(chip(html)).not.toMatch(/class="on"/);
  });
  it('lights Later while it is shown', () => {
    expect(chip(menu('board', true))).toMatch(/class="on"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*class="on"/);
  });
  it('does not light the button’s dot: Later off is how the board starts, not a filter', () => {
    const dot = (later) => /<i><\/i>|<i\/>/.test(renderToStaticMarkup(React.createElement(RoomViewButton, props('board', later))));
    expect(dot(false)).toBe(false);
    expect(dot(true)).toBe(false);
  });
});

describe('the columns share the width', () => {
  const rooms = readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
  const rule = rooms.match(/\.rm-board \{([^}]*)\}/)?.[1] ?? '';
  it('as many as are shown, three when nothing says otherwise', () => {
    expect(rule).toMatch(/grid-template-columns: repeat\(var\(--cols, 3\), minmax\(\d+px, 1fr\)\)/);
  });
});

describe('wired in the app', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  it('the room keeps the choice and hands it to the board and the menu', () => {
    expect(hook).toMatch(/useState\(\(\) => readBoardLater\(\)\)/);
    expect(hook).toMatch(/renderBoard\(onBoardPicked[^,]*, \{ later \}\)/);
    expect(hook).toMatch(/<RoomViewButton [^>]*later=\{later\} onLater=\{/);
  });
  it('the board it draws is told', () => {
    expect(app).toMatch(/renderBoard: \(people, \{ later \}\) => <RoomBoard [\s\S]{0,400}later=\{later\}/);
  });
});
