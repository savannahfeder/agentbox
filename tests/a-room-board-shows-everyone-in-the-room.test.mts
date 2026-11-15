// A ROOM'S BOARD SHOWS EVERYONE IN THE ROOM (w-49cd37092c, 2026-10-22).
//
// Once the room became its board: "I don't see any of my team. There are just
// a bunch of my own tasks and my team has now disappeared even though they
// were just visible." In that room three teammates had not turned Rooms on and
// one room-mate was outside the team. The board took only teammates who share
// their Rooms activity, which a person not on Rooms yet has no way to say, and
// left out room-mates outside the team; that left one person, and a row of one
// draws no tiles.
//
// Now the tiles are everyone in the room, as the grid was, and the board
// draws: you, teammates whose thread cards reach you (unless they turned
// sharing off in Rooms), and room-mates outside the team off the lines their
// presence already shows on their page.
//
// The tiles over the board went on 2026-10-23 (w-dcaa2c122e): on a 30-person
// team "the focus is actually on what everyone's up to", not who is working.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { boardPeople } from '../renderer/src/team/rooms/room-rules.ts';
import { RoomBoard } from '../renderer/src/team/rooms/RoomBoard.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const card = (id, o = {}) => ({ id, me: false, name: id, avatarUrl: null, agents: 1, teammate: false, showActivity: true, activity: null, ...o });
const me = card('sam', { me: true, name: 'Sam Rivera' });
const sharing = card('theo', { teammate: true, name: 'Theo Brooks' });
const notOnRooms = card('david', { teammate: true, away: true, showActivity: false, agents: null, name: 'David B.' });
const turnedOff = card('jun', { teammate: true, showActivity: false, name: 'Jun Ota' });
const roomMate = card('maya', { activity: [{ title: 'Pick a font', project: 'Web', state: 'running', at: 5 }], name: 'Maya C.' });
const stranger = card('alex', { name: 'Alex K.' });
const wall = [me, sharing, notOnRooms, turnedOff, roomMate, stranger];

describe('whose threads a room’s board draws', () => {
  const ids = boardPeople(wall).map((c) => c.id);
  it('mine, and a teammate who shares', () => {
    expect(ids).toContain('sam');
    expect(ids).toContain('theo');
  });
  it('a teammate not on Rooms yet, whose team cards already reach me', () => {
    expect(ids).toContain('david');
  });
  it('a room-mate outside my team, off their presence lines', () => {
    expect(ids).toContain('maya');
  });
  it('never a teammate who turned sharing off, nor someone with nothing shared', () => {
    expect(ids).not.toContain('jun');
    expect(ids).not.toContain('alex');
  });
});

describe('a room-mate outside the team on the board', () => {
  const html = renderToStaticMarkup(React.createElement(TeamContext.Provider, {
    value: { state: { since: null }, me: 'sam', byId: new Map(), alsoById: new Map([['maya', { id: 'maya', name: 'Maya C.', email: '', avatarUrl: null }]]), products: new Map() },
  }, React.createElement(RoomBoard, {
    items: [], products: [], display: { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any', privacy: 'any' }, now: 10,
    cards: [{ personId: 'maya', threadId: 'presence:maya:0', visible: true, title: 'Pick a font', project: 'Web', state: 'running', priority: null, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 5 }],
    picked: ['maya'], onOpenItem: () => {}, onOpenCard: () => {},
  })));
  it('is drawn with their name', () => {
    expect(html).toMatch(/class="who">Maya<\/span><span class="t">Pick a font/);
  });
});

describe('wired in the app', () => {
  const hook = readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('the board draws only those it may, under no row of faces', () => {
    expect(hook).not.toContain('BoardFaces');
    expect(hook).toMatch(/renderBoard\(onBoardPicked\.filter\(\(id\) => onBoardIds\.has\(id\)\), \{ later \}\)/);
  });
  it('the room’s board has room-mates’ presence lines, which open nothing', () => {
    expect(app).toMatch(/renderBoard: \(people, \{ later \}\) => <RoomBoard [\s\S]{0,300}cards=\{\[\.\.\.cards, \.\.\.roomMateCards\(snap\?\.team\?\.rooms\?\.rooms \?\? \[\]\)\]\} picked=\{people\} onOpenCard=\{\(c\) => \{ if \(!isPresenceCard\(c\)\) openTeammateCard\(c\); \}\}/);
  });
});
