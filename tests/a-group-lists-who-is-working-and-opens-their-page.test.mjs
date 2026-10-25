// A GROUP LISTS WHO IS WORKING, AND OPENS THEIR PAGE (w-dcaa2c122e, 2026-10-23).
//
// A room drew everyone as a wall of cards beside its chat. Asked for with
// Groups: the chat takes most of the page, and down the right "who's working
// and maybe how many agents they're running ... level and the basics", no
// emoji; then "I should be able to click into everyone and see their tasks".
// Measured on the drawn list: each row is face, name, level, what they are
// on and their agents; a big group lists only who is working and counts the
// rest; a press on a row opens that person's page in the group. The group's
// options sit in one button in the top bar.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PeoplePanel, inGroupOrder, peopleShown } from '../renderer/src/team/rooms/GroupPage.tsx';
import { GroupOptions } from '../renderer/src/team/rooms/GroupList.tsx';
globalThis.React = React;

const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
const card = (id, o = {}) => ({ id, me: false, name: id, avatarUrl: null, agents: 0, level: 10, status: null, workingOn: null, away: false, ...o });
const small = { members: 4, wall: [card('Priya', { status: 'In interviews' }), card('Maya', { agents: 5, workingOn: 'Billing page' }), card('Sam', { me: true, agents: 3, workingOn: 'Groups' }), card('Theo', { agents: 2, workingOn: 'Phone app' })] };

describe('who is listed, in what order', () => {
  it('you first, then working with most agents first, then the rest, then whoever is not on yet', () => {
    const wall = [card('Lena', { away: true }), card('Priya'), card('Theo', { agents: 2 }), card('Sam', { me: true }), card('Maya', { agents: 5 })];
    expect(inGroupOrder(wall).map((c) => c.id)).toEqual(['Sam', 'Maya', 'Theo', 'Priya', 'Lena']);
  });
  it('everyone in a group of twelve or fewer', () => {
    expect(peopleShown(small)).toMatchObject({ working: 3, more: 0 });
    expect(peopleShown(small).cards).toHaveLength(4);
  });
  it('in a bigger one, you and who is working, and a count of the rest', () => {
    const wall = [card('Sam', { me: true }), card('Kai', { agents: 6 }), card('Omar', { agents: 2 }), card('Lena'), card('Ines')];
    const { cards, more } = peopleShown({ members: 214, wall });
    expect(cards.map((c) => c.id)).toEqual(['Sam', 'Kai', 'Omar']);
    expect(more).toBe(211);
  });
  it('no more than ten of them', () => {
    const wall = Array.from({ length: 30 }, (_, i) => card(`p${i}`, { agents: 1 }));
    expect(peopleShown({ members: 30, wall }).cards).toHaveLength(10);
  });
});

describe('a row', () => {
  const html = renderToStaticMarkup(createElement(PeoplePanel, { room: small, onPerson: () => {} }));
  it('says how many of the group are working', () => {
    expect(html).toContain('3 of 4 working');
  });
  it('is face, name, level, what they are on, and their agents', () => {
    const maya = html.split('class="gr-prow"').find((r) => r.includes('Maya'));
    expect(maya).toMatch(/Maya<\/span><span class="gr-lv">10</);
    expect(maya).toContain('Billing page');
    expect(maya).toContain('5 agents');
  });
  it('says one agent, not one agents', () => {
    const one = renderToStaticMarkup(createElement(PeoplePanel, { room: { members: 1, wall: [card('Ada', { agents: 1 })] }, onPerson: () => {} }));
    expect(one).toContain('1 agent<');
  });
  it('carries no agents mark for someone not running any, and their status instead', () => {
    const priya = html.split('class="gr-prow"').find((r) => r.includes('Priya'));
    expect(priya).toContain('In interviews');
    expect(priya).not.toContain('gr-ag');
  });
  it('has no emoji', () => {
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it('opens their page in the group when pressed', () => {
    expect(html.match(/<button type="button" class="gr-prow"/g)).toHaveLength(4);
    expect(hook).toContain('<PeoplePanel room={open} onPerson={(id) => setPane(`person:${id}`)} />');
  });
});

describe('the group’s options', () => {
  const items = (props) => [...renderToStaticMarkup(createElement(GroupOptions, {
    named: true, members: 4, muted: false, canLeave: true, board: true, onPick: () => {}, onClose: () => {}, ...props,
  })).matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
  it('on a named group: everyone’s threads, invite, members, mute, leave, then a new group or one to find', () => {
    expect(items({})).toEqual(['Everyone’s threads', 'Invite people', 'Members', 'Mute', 'Leave group', 'New group', 'Find groups to join']);
  });
  it('on a chat with people: no board and no invite, and it is a chat you leave', () => {
    expect(items({ named: false, board: false })).toEqual(['Members', 'Mute', 'Leave chat', 'New group', 'Find groups to join']);
  });
  it('your team’s group cannot be left, and a muted one offers Unmute', () => {
    expect(items({ canLeave: false, muted: true })).toEqual(['Everyone’s threads', 'Invite people', 'Members', 'Unmute', 'New group', 'Find groups to join']);
  });
  it('sits in the top bar on a group’s chat, where the View button sits over everyone’s threads', () => {
    expect(hook).toMatch(/: onChat \? <GroupMenuButton/);
  });
});
