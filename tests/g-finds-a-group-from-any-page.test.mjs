// G FINDS A GROUP FROM ANY PAGE (w-dcaa2c122e, 2026-10-24).
//
// Drawn as one of five ways to switch groups, G opened a search over your
// groups, and only on a group's page. Liked: "I love the idea of G opening a
// search for groups." It now opens from any page while Groups is on.
// Measured on the stage: typing "ma" listed Northwind and General too, because
// the search read what was said last ("Maya: ...", "Omar: ..."), and on a
// group's page the box started on the group already open, so G then Enter
// went nowhere. Names only now, the name's start first; the box starts on a
// group other than the open one, and stays where it opened while you type.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GroupFinder, findGroups } from '../renderer/src/team/rooms/GroupsColumn.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../renderer/src/App.tsx');
const hook = read('../renderer/src/team/rooms/useRooms.tsx');

const group = (name, last = '', o = {}) => ({ key: `room:${name}`, name, faces: [], at: 0, unread: false, pinned: false, last, ...o });
const rows = [
  group('Northwind', 'Maya: can you approve the keys?', { unread: true }),
  group('General', 'Omar: Cloud runs.'),
  group('Kai, Omar'),
  group('Maya, Priya'),
  group('Maya'),
  group('Lab Team Mates'),
];
const names = (q) => findGroups(rows, q).map((g) => g.name);

describe('what the finder finds', () => {
  it('a name’s start first, then a word’s start, then anywhere in the name', () => {
    expect(names('ma')).toEqual(['Maya, Priya', 'Maya', 'Lab Team Mates', 'Kai, Omar']);
  });
  it('one word inside a chat’s names', () => {
    expect(names('priya')).toEqual(['Maya, Priya']);
  });
  it('nothing by what was said last', () => {
    expect(names('approve')).toEqual([]);
    expect(names('ma')).not.toContain('Northwind');
    expect(names('ma')).not.toContain('General');
  });
  it('every group, in the column’s order, with nothing typed or only spaces', () => {
    expect(names('')).toEqual(rows.map((g) => g.name));
    expect(names('   ')).toEqual(rows.map((g) => g.name));
  });
  it('the same whatever the capitals', () => {
    expect(names('NORTH')).toEqual(['Northwind']);
  });
});

describe('the finder', () => {
  const draw = (props) => renderToStaticMarkup(createElement(GroupFinder, { rows, now: 0, onOpen() {}, onClose() {}, ...props }));
  const selected = (html) => /palette-item gc-frow selected".*?<span class="rm-one">([^<]+)</.exec(html)?.[1];
  it('starts on a group other than the open one, so G then Enter switches', () => {
    expect(selected(draw({ current: 'room:Northwind' }))).toBe('General');
  });
  it('starts on the first group from a page that is not a group', () => {
    expect(selected(draw({ current: null }))).toBe('Northwind');
  });
  it('puts no new-message dot on the group you are reading', () => {
    expect(draw({ current: 'room:Northwind' })).not.toContain('gc-dot');
    expect(draw({ current: null })).toContain('gc-dot');
  });
  it('holds the height it opened at, so the box does not jump as you type', () => {
    expect(draw({})).toContain(`style="height:${6 * 60 + 12}px"`);
    expect(draw({ rows: [] })).toContain(`style="height:${60 + 12}px"`);
  });
  it('says you are in no groups rather than that nothing matched', () => {
    expect(draw({ rows: [] })).toContain('You are not in any groups yet.');
  });
});

describe('the key', () => {
  const g = app.indexOf('// G FINDS A GROUP from any page');
  it('opens the finder off a group too, and not while typing, over a dialog, or with a modifier', () => {
    expect(g).toBeGreaterThan(0);
    const line = app.slice(g, app.indexOf('\n', app.indexOf('\n', g) + 1));
    for (const gate of ['roomsUi.findGroup', '!roomsUi.dialogOpen', '!modal', '!inInput', '!e.metaKey', '!e.ctrlKey', '!e.altKey']) expect(line).toContain(gate);
  });
  it('is read after Settings has taken the keyboard', () => {
    expect(app.lastIndexOf('if (settingsOpen) return;', g)).toBeGreaterThan(0);
  });
  it('does nothing while Groups is off', () => {
    expect(hook).toContain('findGroup: live ? () => setFinderOpen(true) : null');
  });
});
