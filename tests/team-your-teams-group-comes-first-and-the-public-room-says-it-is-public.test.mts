// YOUR TEAM'S GROUP COMES FIRST, AND THE PUBLIC ROOM SAYS IT IS PUBLIC.
//
// Dev: "Chats has a 'Coworking' public group listing Dev,
// Jordan, Maya, Sofia as people" and "only found [Lumen] at 02:33 by opening
// Chats". Both groups were pinned, so they sorted by name and Coworking led.
// The people list read the same in both, so teammates looked like strangers.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { GENERAL_ROOM } from '../main/team/rooms-memory.mts';
import { groupsInOrder } from '../renderer/src/team/rooms/GroupsSidebar.tsx';
import { groupChoices } from '../renderer/src/team/rooms/GroupList.tsx';
import { groupInTab, peopleHeading, groupTag } from '../renderer/src/team/rooms/room-rules.ts';
import { buildMembers } from '../renderer/src/team/everything/members.ts';
import { MemberWord } from '../renderer/src/team/everything/TeamStrip.tsx';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const convo = (name, o = {}) => ({ key: `room:${name}`, kind: 'room', id: name, name, faces: [], last: '', at: 1, unread: false, ...o });

describe('the order of groups', () => {
  const list = [convo('Coworking', { at: 9 }), convo('Book club', { at: 5 }), convo('Lumen', { at: 1 })];
  const pinned = new Set(['room:Coworking', 'room:Lumen']);
  const rows = groupChoices(list, pinned, { team: new Set(['room:Lumen']), open: new Set(['room:Coworking']) });
  it('your team’s group leads, even when another pinned one sorts ahead of it', () => {
    expect(groupsInOrder(rows)[0].name).toBe('Lumen');
  });
  it('the public room goes after your own groups', () => {
    expect(groupsInOrder(rows).map((g) => g.name)).toEqual(['Lumen', 'Book club', 'Coworking']);
  });
  it('with no team, nothing changes but the public room going last', () => {
    const none = groupChoices([convo('Coworking'), convo('Book club')], new Set(['room:Coworking']), { open: new Set(['room:Coworking']) });
    expect(groupsInOrder(none).map((g) => g.name)).toEqual(['Book club', 'Coworking']);
  });
  it('a chat with people stays after the groups', () => {
    const talk = groupChoices([convo('Lumen'), { ...convo('x'), faces: [{ name: 'Maya', url: null }] }], new Set(), { team: new Set(['room:Lumen']) });
    expect(groupsInOrder(talk).map((g) => g.name)).toEqual(['Lumen', 'Maya']);
  });
});

describe('the group Groups opens', () => {
  const rooms = [{ id: 'cow', kind: 'room', pinned: true, teamId: null }, { id: 'team', kind: 'room', pinned: true, teamId: 't' }];
  it('your team’s, over the pinned public one', () => {
    expect(groupInTab(rooms, null).id).toBe('team');
  });
  it('the one you were in last still wins', () => {
    expect(groupInTab(rooms, 'cow').id).toBe('cow');
  });
  it('the public one when you have no team', () => {
    expect(groupInTab([rooms[0]], null).id).toBe('cow');
  });
});

describe('the words', () => {
  it('the team’s group is your team, the public room is everyone here', () => {
    expect(peopleHeading({ teamId: 't', listed: false })).toBe('Your team');
    expect(peopleHeading({ teamId: null, listed: true })).toBe('Everyone here');
    expect(peopleHeading({ teamId: null, listed: false })).toBe('People');
    expect(peopleHeading({})).toBe('People');
  });
  it('a tag for the two that need one, and none for a private group', () => {
    expect(groupTag({ team: true })).toBe('Your team');
    expect(groupTag({ open: true })).toBe('Public');
    expect(groupTag({})).toBeNull();
  });
  it('the public room’s card says so, and another chat’s card still says Chat', () => {
    const members = buildMembers({
      me: { id: 'me', name: 'Dev', avatarUrl: null }, people: [{ id: 'me', name: 'Dev', avatarUrl: null }],
      chats: [{ key: 'room:cow', name: 'Coworking', faces: [], last: '', at: 2, unread: false, open: true }, { key: 'room:book', name: 'Book club', faces: [], last: '', at: 1, unread: false }],
    });
    expect(members.find((m) => m.key === 'room:cow').open).toBe(true);
    expect(members.find((m) => m.key === 'room:book').open).toBeFalsy();
    const word = (key) => renderToStaticMarkup(h(MemberWord, { m: members.find((m) => m.key === key) }));
    expect(word('room:cow')).toContain('Public group');
    expect(word('room:book')).toContain('Chat');
    expect(word('room:book')).not.toContain('Public');
  });
});

describe('a team invite', () => {
  it('puts you in the team’s group, and it comes before the public room', async () => {
    const cloud = createMemoryCloud();
    const maya = memoryBackend(cloud, signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya' }));
    const dev = memoryBackend(cloud, signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev' }));
    const team = await maya.createTeam('Lumen');
    await maya.invite(team.id, 'dev@lumen.test');
    await dev.joinListedRoom(GENERAL_ROOM);
    await dev.acceptInvite(team.id);
    const rooms = await dev.myRooms();
    expect(rooms.map((r) => r.name)).toEqual(['Lumen', 'Coworking']);
    expect(rooms[0].teamId).toBe(team.id);
  });
  it('joining opens that group', () => {
    const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/teamAcceptInvite[\s\S]{0,400}openTeamGroup/);
  });
});

describe('what a project shares', () => {
  it('the project’s button carries no line explaining it', () => {
    const share = readFileSync(new URL('../renderer/src/team/ProjectShare.tsx', import.meta.url), 'utf8');
    expect(share).not.toContain('ps-crosses');
  });
});
