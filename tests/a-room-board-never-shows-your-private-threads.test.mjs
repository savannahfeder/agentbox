// A ROOM'S BOARD NEVER SHOWS YOUR PRIVATE THREADS (w-49cd37092c, 2026-10-22).
//
// "Very critically it seems to be showing my private tasks here as well... This
// is meant to show what the team can see." The room's board drew one's own
// threads through the Inbox board's rule, which keeps every thread of yours,
// private ones included. Teammates never saw them (a private thread sends no
// card), but the room is the team's view, so it now keeps only what the team
// can see: a thread made private, one in a personal or private project, and
// one from before you joined stay off it.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomBoard } from '../renderer/src/team/rooms/RoomBoard.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.parse('2026-10-22T15:00:00Z');
const JOINED = NOW - 7 * 864e5;
const sam = { id: 'p-sam', name: 'Sam Rivera', email: 'sam@example.test', avatarUrl: null };
const shared = { slug: 'web', name: 'Web', team: { projectId: 'pj1', teamId: 't1', visibility: 'team', people: [], sharedBy: sam.id } };
const personal = { slug: 'me', name: 'Me', personal: true, team: null };
const closed = { slug: 'ops', name: 'Ops', seenBy: 'private', team: null };
const display = { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any', privacy: 'any' };
const item = (id, title, o = {}) => ({ id, product: 'web', title, body: '', status: 'open', labels: [], createdBy: sam.id, createdAt: NOW - 3600e3, updatedAt: NOW - 60e3, ...o });

const draw = (items, d = display) => renderToStaticMarkup(React.createElement(TeamContext.Provider, {
  value: { state: { since: JOINED }, me: sam.id, byId: new Map([[sam.id, sam]]), products: new Map() },
}, React.createElement(RoomBoard, {
  items, products: [shared, personal, closed], display: d, now: NOW, stateOf: () => 'waiting',
  cards: [], picked: [sam.id], onOpenItem: () => {}, onOpenCard: () => {},
})));

describe('your own threads on a room’s board', () => {
  it('shows one the team can see', () => {
    expect(draw([item('w-1', 'Pricing page copy')])).toContain('Pricing page copy');
  });
  it('shows one shared with chosen people', () => {
    expect(draw([item('w-2', 'Offer letter', { visibility: 'people', visibleTo: ['p-maya'] })])).toContain('Offer letter');
  });
  it('never one made private', () => {
    expect(draw([item('w-3', 'Tax filing', { visibility: 'private' })])).not.toContain('Tax filing');
  });
  it('never one in a personal project or a project kept to you', () => {
    expect(draw([item('w-4', 'Coach instructions', { product: 'me' })])).not.toContain('Coach instructions');
    expect(draw([item('w-5', 'Runway cuts', { product: 'ops' })])).not.toContain('Runway cuts');
  });
  it('never one from before you joined the team', () => {
    expect(draw([item('w-6', 'Old notes', { createdAt: JOINED - 864e5 })])).not.toContain('Old notes');
  });
  it('whatever the Inbox’s own privacy choice is', () => {
    expect(draw([item('w-3', 'Tax filing', { visibility: 'private' })], { ...display, privacy: 'private' })).not.toContain('Tax filing');
  });
});
