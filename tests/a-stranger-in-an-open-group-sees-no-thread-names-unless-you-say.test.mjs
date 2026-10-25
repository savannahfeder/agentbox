// A STRANGER IN AN OPEN GROUP SEES NO THREAD NAMES UNLESS YOU SAY (w-64116bb761, 2026-10-24).
//
// Someone with no team who switched Groups on was put in General, and by
// default everyone there got the name of the thread their newest agent was on
// and a list of their thread names with projects. Measured by running
// cardsFor and myPresence for a person with no team: a thread made 30 days
// before they signed in went out too. Agreed: strangers see your name, level,
// agent count and the line you wrote about yourself; thread names only once
// you turn them on; an open group says so the first time you open it, with
// Leave group beside it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mjs';
import { wallCards } from '../shared/room-cards.mjs';
import { Name } from '../shared/product-name.mjs';
import { PeoplePanel } from '../renderer/src/team/rooms/GroupPage.tsx';
import { OpenGroupNotice } from '../renderer/src/team/rooms/OpenGroupNotice.tsx';
import { openGroupWords, noticeShown, readNoticeSeen, writeNoticeSeen } from '../renderer/src/team/rooms/room-rules.ts';
globalThis.React = React;

const T0 = Date.parse('2026-10-24T10:00:00-07:00');
const timers = { setTimeout: (fn) => { queueMicrotask(fn); return {}; }, clearTimeout: () => {} };

function solo({ before } = {}) {
  const cloud = createMemoryCloud();
  cloud.now = () => T0;
  const id = signUpMemory(cloud, { email: 'alex@elsewhere.test', name: 'Alex Rivera' });
  const backend = memoryBackend(cloud, id);
  const product = { slug: 'budget', name: 'Budget' };
  const thread = { threadId: 'w-1', title: 'Import bank CSVs', project: 'Budget', state: 'running', people: null, updatedAt: T0 - 60_000 };
  const rooms = createRooms({
    backend: () => backend,
    me: () => ({ id, name: 'Alex Rivera' }),
    team: () => ({ team: null, people: [], cards: [] }),
    enabled: () => true,
    device: () => 'abcdefabcdef',
    presenceFacts: () => ({
      running: [{ itemId: 'w-1', product: 'budget', startedAt: T0 - 60_000 }],
      items: [{ id: 'w-1', product: 'budget', title: 'Import bank CSVs' }],
      products: [product], cards: [thread], summary: {},
    }),
    prefsFile: roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), 'open-group-'))),
    now: () => T0,
    timers,
  });
  return { cloud, id, backend, rooms, before };
}
const rowOf = (w) => [...w.cloud.roomPresence.values()].find((r) => r.person_id === w.id);

describe('a new card', () => {
  it('keeps thread names to your team, so General gets no thread name and no list of threads', async () => {
    const w = solo();
    await w.rooms.tick();
    expect(w.rooms.state().me.show_working).toBe('team');
    expect(rowOf(w)).toMatchObject({ agents_running: 1, working_on: null, activity: [] });
  });

  // Never a list of threads, even then (tests/a-persons-page-shows-none-of-their-threads).
  it('names your thread to everyone once you turn that on', async () => {
    const w = solo();
    await w.rooms.tick();
    await w.rooms.saveProfile({ show_working: 'everyone' });
    expect(rowOf(w).working_on).toBe('Import bank CSVs');
    expect(rowOf(w).activity).toEqual([]);
  });

  it('leaves a card that already shows its work the way its owner set it', async () => {
    const w = solo();
    await w.backend.saveRoomProfile({ display_name: 'Alex R.', show_working: 'everyone' });
    await w.rooms.tick();
    expect(w.rooms.state().me.show_working).toBe('everyone');
  });
});

describe('your own row in an open group says what strangers see', () => {
  const me = (show_working) => ({ person_id: 'p-me', display_name: 'Alex R.', show_working, bio: 'Budgeting app for myself' });
  const mine = { workingOn: 'Import bank CSVs', agents: 1 };
  const mineIn = (show_working, listed) => wallCards({ members: ['p-me'], profiles: [me(show_working)], meId: 'p-me', now: T0, mine, listed })[0];

  it('no thread name while it is kept to your team', () => {
    expect(mineIn('team', true)).toMatchObject({ workingOn: null, workingPrivate: true });
    expect(mineIn('none', true)).toMatchObject({ workingOn: null, workingPrivate: true });
  });
  it('your thread once everyone may see it', () => {
    expect(mineIn('everyone', true)).toMatchObject({ workingOn: 'Import bank CSVs', workingPrivate: false });
  });
  it('your own thread, as before, in a group you were invited to', () => {
    expect(mineIn('team', false)).toMatchObject({ workingOn: 'Import bank CSVs', workingPrivate: false });
  });
  it('nothing hidden when no agent is running', () => {
    const idle = wallCards({ members: ['p-me'], profiles: [me('team')], meId: 'p-me', now: T0, mine: { workingOn: null, agents: 0 }, listed: true })[0];
    expect(idle).toMatchObject({ workingOn: null, workingPrivate: false });
  });
});

describe('the People list', () => {
  const card = (id, o = {}) => ({ id, me: false, name: id, avatarUrl: null, agents: 2, level: 10, status: null, workingOn: null, workingPrivate: true, bio: null, away: false, ...o });
  const line = (c) => renderToStaticMarkup(createElement(PeoplePanel, { room: { members: 1, wall: [c] }, onPerson: () => {} }));

  it('shows the line someone wrote about themselves where their thread is kept from you', () => {
    const html = line(card('Kai', { bio: 'Fintech backend, mostly Go' }));
    expect(html).toContain('Fintech backend, mostly Go');
    expect(html).not.toContain('Private thread');
  });
  it('still says Private thread for someone who wrote nothing', () => {
    expect(line(card('Kai'))).toContain('Private thread');
  });
  it('shows a thread name you may see before the line', () => {
    const html = line(card('Kai', { workingOn: 'Ledger to Postgres', workingPrivate: false, bio: 'Fintech backend' }));
    expect(html).toContain('Ledger to Postgres');
    expect(html).not.toContain('Fintech backend');
  });
});

describe('the line over an open group', () => {
  const prof = (o = {}) => ({ show_working: 'team', show_level: true, show_agents: true, ...o });

  it('says who can join and exactly what they see', () => {
    expect(openGroupWords(prof())).toBe(`Anyone on ${Name} can join this group. They see your name, level and how many agents you run, never your threads.`);
  });
  it('leaves out what you switched off', () => {
    expect(openGroupWords(prof({ show_level: false }))).toBe(`Anyone on ${Name} can join this group. They see your name and how many agents you run, never your threads.`);
    expect(openGroupWords(prof({ show_level: false, show_agents: false }))).toBe(`Anyone on ${Name} can join this group. They see your name, never your threads.`);
  });
  it('says so when your thread names are on', () => {
    expect(openGroupWords(prof({ show_working: 'everyone' }))).toBe(`Anyone on ${Name} can join this group. They see your name, level, how many agents you run and the names of your threads.`);
  });

  it('shows over an open group you have not seen yet, and nowhere else', () => {
    expect(noticeShown({ id: 'r-general', listed: true, teamId: null }, [])).toBe(true);
    expect(noticeShown({ id: 'r-general', listed: true, teamId: null }, ['r-general'])).toBe(false);
    expect(noticeShown({ id: 'r-friends', listed: false, teamId: null }, [])).toBe(false);
    expect(noticeShown({ id: 'r-team', listed: false, teamId: 't-1' }, [])).toBe(false);
  });
  it('is remembered once seen', () => {
    const kept = new Map();
    const store = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v) };
    expect(readNoticeSeen(store)).toEqual([]);
    writeNoticeSeen(['r-general'], store);
    expect(readNoticeSeen(store)).toEqual(['r-general']);
  });

  it('has Leave group beside it, and Hide my threads only while they show', () => {
    const off = renderToStaticMarkup(createElement(OpenGroupNotice, { me: prof(), onLeave: () => {}, onHide: () => {}, onOk: () => {} }));
    expect(off).toContain('Leave group');
    expect(off).toContain('>OK<');
    expect(off).not.toContain('Hide my threads');
    const on = renderToStaticMarkup(createElement(OpenGroupNotice, { me: prof({ show_working: 'everyone' }), onLeave: () => {}, onHide: () => {}, onOk: () => {} }));
    expect(on).toContain('Hide my threads');
  });

  it('is drawn over the open group’s chat, and its Leave group leaves', () => {
    const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
    expect(hook).toMatch(/noticeShown\(open/);
    expect(hook).toMatch(/onLeave=\{\(\) => void groupAction\(open!?, 'leave'/);
  });
});
