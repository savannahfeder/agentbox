// A CHAT WITH A TEAMMATE OPENS ON THE SAME PAGE AS A GROUP (w-d28f0c6ba8, 2026-10-26).
//
// In Chats, Maya (a chat started in Groups) opened beside the Chats list with
// People down the right, but Margarette (a teammate on your team, whose chat is
// the team version's direct record) opened a different page: a "NEEDS YOU /
// MARGARETTE PINEDA" bar over a thread, with no Chats list and no one's
// presence. Reported as "it shows the wrong UI ... only with some people".
// Measured on the stand-in team (scripts/lib/groups-stage.mjs): pressing Priya
// drew no `.gr-page`, no `.cx-list` and no `.gr-side`; pressing Maya drew all
// three. Now a direct record is drawn in the group's page, its row lit in the
// list, its people listed the way a group lists them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { directPeople } from '../renderer/src/team/rooms/direct-people.ts';
import { PeoplePanel } from '../renderer/src/team/rooms/GroupPage.tsx';
import { ChatsColumn, ChatsContext } from '../renderer/src/teammates/ChatsColumn.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../renderer/src/App.tsx');
const hook = read('../renderer/src/team/rooms/useRooms.tsx');
const focus = read('../renderer/src/components/Focus.tsx');

const card = (id, o = {}) => ({ id, me: false, name: id, avatarUrl: null, agents: 0, level: 10, status: null, workingOn: null, away: false, teammate: true, ...o });
const person = (id, name) => ({ id, email: `${id}@example.com`, name, avatarUrl: null });
const rooms = [
  { id: 'r-team', teamId: 't-1', wall: [card('p-me', { me: true, agents: 3, workingOn: 'Groups' }), card('p-maya', { name: 'Maya Chen', agents: 5, workingOn: 'Billing' }), card('p-priya', { name: 'Priya Nair', status: 'In interviews' })] },
  { id: 'r-g2', teamId: null, wall: [card('p-me', { me: true, agents: 3 }), card('p-maya', { name: 'Maya Chen', agents: 5 })] },
];
const team = [person('p-me', 'Sam Rivera'), person('p-maya', 'Maya Chen'), person('p-priya', 'Priya Nair'), person('p-marg', 'Margarette Pineda')];

describe('who a chat with a teammate lists beside it', () => {
  it('you first, then the person, from the card Groups already holds for them', () => {
    const { wall, members } = directPeople({ people: ['p-priya'], rooms, team, meId: 'p-me' });
    expect(wall.map((c) => c.id)).toEqual(['p-me', 'p-priya']);
    expect(members).toBe(2);
    expect(wall[1]).toMatchObject({ name: 'Priya Nair', status: 'In interviews' });
  });
  it('everyone in a chat with two teammates', () => {
    expect(directPeople({ people: ['p-priya', 'p-maya'], rooms, team, meId: 'p-me' }).wall.map((c) => c.id)).toEqual(['p-me', 'p-priya', 'p-maya']);
  });
  it('a teammate not on Groups yet is still listed, and says so', () => {
    const { wall } = directPeople({ people: ['p-marg'], rooms, team, meId: 'p-me' });
    expect(wall[1]).toMatchObject({ id: 'p-marg', name: 'Margarette Pineda', away: true });
    const html = renderToStaticMarkup(createElement(PeoplePanel, { room: { members: 2, wall }, onPerson: () => {} }));
    expect(html).toContain('Margarette Pineda');
    expect(html).toContain('Not on Groups yet');
  });
  it('nobody who is not in the chat', () => {
    const ids = directPeople({ people: ['p-priya'], rooms, team, meId: 'p-me' }).wall.map((c) => c.id);
    expect(ids).not.toContain('p-maya');
  });
  it('says which group a person was found in, so pressing them opens their page there', () => {
    expect(directPeople({ people: ['p-maya'], rooms, team, meId: 'p-me' }).roomOf).toMatchObject({ 'p-maya': 'r-team' });
    expect(directPeople({ people: ['p-marg'], rooms, team, meId: 'p-me' }).roomOf['p-marg']).toBeUndefined();
  });
});

describe('the page it opens on', () => {
  it('lights its own row in the Chats list', () => {
    const value = { teammates: [], now: 0, onTeammate: () => {}, onNew: () => {}, onGroup: () => {},
      groups: [{ key: 'direct:w-dm1', name: 'Priya', faces: [{ name: 'Priya', url: null }], at: 0, unread: false },
        { key: 'room:r-g2', name: 'Maya', faces: [{ name: 'Maya', url: null }], at: 0, unread: false }] };
    const html = renderToStaticMarkup(createElement(ChatsContext.Provider, { value }, createElement(ChatsColumn, { current: 'direct:w-dm1' })));
    const lit = html.split('<button').filter((b) => b.includes('aria-current="page"'));
    expect(lit).toHaveLength(1);
    expect(lit[0]).toContain('Priya');
  });
  // The Chats list and bar come from a-persons-chat-opened-from-chats-keeps-the-chats-list.
  it('lists who is in it down the right, inside the Chats frame', () => {
    expect(hook).toMatch(/chatPeople: \(people: string\[\]\) => \{[\s\S]{0,200}directPeople\(\{ people, rooms: all, team, meId \}\)[\s\S]{0,100}<PeoplePanel/);
    expect(app).toMatch(/\{inChats && roomsUi\.live && roomsUi\.chatPeople\(directs\.find\(\(d\) => d\.id === focused\.id\)\?\.people \?\? \[\]\)\}\s*<\/ChatsFrame>/);
    const css = read('../renderer/src/team/rooms/rooms.css');
    expect(css).toContain('.cx-frame-main:has(> .gr-side) { flex-direction: row; }');
  });
  it('its box says Message, as a group’s does', () => {
    expect(focus).toContain("talkWord={inChats ? 'Message' : undefined}");
    expect(focus).toMatch(/inChats && !said\.draft && talkNames\?\.length \? \{ \.\.\.said, text: `Message \$\{joinNames\(talkNames\)\}` \}/);
  });
  it('says nothing about agents until one is working in it', () => {
    expect(focus).toContain('{!heldByPerson && !(inChats && !session) && <Live');
  });
});
