// Groups are for your team. A group with someone outside it is what a paid
// team is for, so the app must offer no way to make one (w-d19d20f14f,
// 2026-11-04). Measured before the change: the group menu offered New group,
// Find groups to join and Invite people; Start a group offered "Anyone with
// the link" and "Anyone on Agentbox"; an old invite link opened a Join button;
// the Mac made a group chat with anyone off a shared wall; and someone with no
// team was put in the public Coworking group on their first pass.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms } from '../main/team/rooms.mts';
import { GroupOptions } from '../renderer/src/team/rooms/GroupList.tsx';
import { MembersMenu } from '../renderer/src/team/rooms/RoomDialogs.tsx';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
const timers = { setTimeout: () => ({}), clearTimeout: () => {} };

async function person(cloud, name, teamState = { team: null, people: [], cards: [] }) {
  const id = signUpMemory(cloud, { email: `${name.toLowerCase()}@x.test`, name });
  const backend = memoryBackend(cloud, id);
  const p = { id, backend, teamState };
  p.rooms = createRooms({
    backend: () => backend, me: () => ({ id, name, avatarUrl: null, status: null }), team: () => p.teamState, enabled: () => true,
    device: () => '0123456789ab', presenceFacts: () => ({ running: [], items: [], products: [], summary: null }), now: () => Date.UTC(2026, 10, 4), timers,
  });
  await p.rooms.start();
  return p;
}

describe('on the Mac', () => {
  it('someone with no team is put in no group', async () => {
    const jun = await person(createMemoryCloud(), 'Jun');
    await jun.rooms.tick();
    await flush();
    expect(jun.rooms.state().rooms).toEqual([]);
  });

  it('a group chat takes teammates, and nobody else', async () => {
    const cloud = createMemoryCloud();
    const maya = await person(cloud, 'Maya');
    const theo = await person(cloud, 'Theo');
    const kai = await person(cloud, 'Kai');
    const team = await maya.backend.createTeam('Northwind');
    await maya.backend.invite(team.id, 'theo@x.test');
    await theo.backend.acceptInvite(team.id);
    maya.teamState = { team: { id: team.id }, people: [{ id: maya.id }, { id: theo.id }], cards: [] };
    // Kai shares an old open group with Maya, the way strangers used to meet.
    const old = await kai.backend.createRoom({ name: 'Old open group' });
    await maya.backend.joinRoomByLink(await kai.backend.roomLink(old));
    await maya.rooms.refresh();

    await expect(maya.rooms.create({ name: 'Theo', kind: 'group', people: [theo.id] })).resolves.toEqual(expect.any(String));
    await expect(maya.rooms.create({ name: 'Kai', kind: 'group', people: [kai.id] })).rejects.toThrow(/team/);
    await expect(maya.rooms.create({ name: 'Theo, Kai', kind: 'group', people: [theo.id, kai.id] })).rejects.toThrow(/team/);
  });

  it('a named group, open or by link, is not made at all', async () => {
    const maya = await person(createMemoryCloud(), 'Maya');
    for (const o of [{ name: 'Weekend builds' }, { name: 'Weekend builds', listed: true }, { name: 'Weekend builds', inviteOnly: true }]) {
      await expect(maya.rooms.create(o)).rejects.toThrow(/team/);
    }
  });
});

describe('on screen', () => {
  const options = renderToStaticMarkup(React.createElement(GroupOptions, { named: true, members: 4, muted: false, canLeave: true, board: true, decisions: 2, onPick: () => {}, onClose: () => {} }));
  it('the group menu offers no new group, no finding one and no invite', () => {
    expect(options).toContain('Members');
    for (const gone of ['New group', 'Find groups', 'Invite people']) expect(options).not.toContain(gone);
  });

  it('the members list invites nobody', () => {
    const room = { id: 'r', name: 'Northwind', kind: 'room', members: 2, wall: [{ id: 'a', name: 'Maya Chen', me: false, avatarUrl: null }] };
    const html = renderToStaticMarkup(React.createElement(MembersMenu, { room, at: { left: 0, bottom: 0 }, onClose: () => {} }));
    expect(html).toContain('Maya');
    expect(html).not.toContain('Invite people');
  });

  it('nothing starts, finds, joins or invites to a group', () => {
    const src = read('renderer/src/team/rooms/useRooms.tsx');
    for (const gone of ['StartRoomDialog', 'FindRooms', 'InviteDialog', 'JoinDialog', "'joinByLink'", "'joinListed'", "'listed'", "'invite'", "'link'"]) {
      expect(src, gone).not.toContain(gone);
    }
    expect(read('renderer/src/team/rooms/RoomPage.tsx')).not.toContain('joinLink');
  });

  it('an old invite link says it does not work, instead of doing nothing', () => {
    expect(read('renderer/src/team/rooms/useRooms.tsx')).toContain("toast('That invite link does not work any more')");
  });
});
