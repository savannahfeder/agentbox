// A GROUP CHAT READS AS PLAINLY AS A TEAMMATE CHAT.
//
// The owner, on the team version: "extra unnecessary text in random areas...
// too cluttered to understand". Seen on a picture of the team's group chat in
// Chats, beside an AI teammate's chat: the side panel said "0 of 3 working",
// put a bare level number beside every name ("You 1", "Dev 1") and "Not
// running" under each person; times read "21:00" where the teammate chat said
// "9:04pm"; two searches sat stacked (a button with a G key over a Search
// box); and the day and New lines were mono capitals ("TODAY", "NEW") where
// the teammate chat says a quiet "Today" between two lines. Measured here on
// the drawn panel, the drawn chat, the header and the stylesheet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PeoplePanel } from '../renderer/src/team/rooms/GroupPage.tsx';
import { RoomChat } from '../renderer/src/team/rooms/RoomChat.tsx';
import { GroupsHead } from '../renderer/src/team/rooms/GroupsColumn.tsx';
import { ChatsColumn, ChatsContext } from '../renderer/src/teammates/ChatsColumn.tsx';
import { clockOf } from '../renderer/src/teammates/chat-lines.ts';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

describe('who is in the group, down the right', () => {
  const card = (id, o = {}) => ({ id, me: false, name: id, avatarUrl: null, agents: 0, level: 1, status: null, workingOn: null, workingPrivate: false, bio: null, away: false, teammate: true, ...o });
  const panel = (wall, o = {}) => renderToStaticMarkup(createElement(PeoplePanel, { room: { members: wall.length, wall, teamId: 't-1', ...o }, onPerson: () => {} }));
  const idle = [card('p-me', { me: true }), card('Dev'), card('Sofia')];

  it('is headed "Your team" alone while nobody is working', () => {
    const html = panel(idle);
    expect(html).toContain('Your team');
    expect(html).not.toMatch(/of 3 working/);
    expect(html).not.toContain('gr-pn');
  });
  it('says how many are working in words once someone is', () => {
    expect(panel([card('p-me', { me: true }), card('Dev', { agents: 2, workingOn: 'Billing page' }), card('Sofia')])).toContain('1 working now');
    expect(panel([card('p-me', { me: true, agents: 1, workingOn: 'Groups' }), card('Dev', { agents: 2, workingOn: 'Billing page' }), card('Sofia')])).toContain('2 working now');
  });
  it('puts no bare number beside a name', () => {
    expect(panel(idle)).not.toContain('gr-lv');
  });
  it('says nothing under someone with nothing on, rather than "Not running"', () => {
    const html = panel(idle);
    expect(html).not.toContain('Not running');
    expect(html).not.toContain('gr-l2');
  });
  it('names the thread someone is on, and keeps a status a person wrote', () => {
    const html = panel([card('Dev', { agents: 1, workingOn: 'Billing page' }), card('Sofia', { status: 'In interviews' })]);
    expect(html).toContain('Billing page');
    expect(html).toContain('In interviews');
  });
  it('still says who is not on Groups yet', () => {
    expect(panel([card('Lena', { away: true })])).toContain('Not on Groups yet');
  });
});

describe('a time in the group chat', () => {
  const at = new Date(2026, 9, 21, 21, 0).getTime();
  const room = { id: 'r1', name: 'Lumen', kind: 'room', teamId: 't', listed: false, inviteOnly: false, role: 'member', members: 2, createdAt: at - 1e9, pinned: false, muted: false, unread: 0, readAt: at + 1, lastAt: at, agents: 0, wall: [] };
  const people = [{ id: 'p-me', name: 'Sam', avatarUrl: null, me: true }, { id: 'p-so', name: 'Sofia', avatarUrl: null, me: false }];
  const calls = { onSend: async () => null, onRead: () => {}, onReact: () => {}, onEdit: async () => null, onDelete: () => {}, onMarkUnread: () => {}, onPutFile: async () => null, loadFile: async () => null };
  const html = renderToStaticMarkup(createElement(RoomChat, { room, people, meId: 'p-me', now: at + 60_000, full: true, ...calls,
    messages: [{ id: 'a', roomId: 'r1', by: 'p-so', body: 'Team look', inReplyTo: null, mentions: [], at }] }));

  it('reads as the teammate chat reads it', () => {
    expect(html).toContain(`<em>${clockOf(at)}</em>`);
  });
  it('is drawn by the one formatter in the list of conversations too', () => {
    expect(read('../renderer/src/team/rooms/MessagesPage.tsx')).toMatch(/import \{ clockOf \} from '..\/..\/teammates\/chat-lines'/);
    expect(read('../renderer/src/team/rooms/room-rules.ts')).not.toMatch(/export function clockOf/);
  });
});

describe('searching Chats', () => {
  const value = { teammates: [], groups: [], now: 0, onTeammate: () => {}, onNew: () => {}, onGroup: () => {} };
  const inChats = (el) => renderToStaticMarkup(createElement(ChatsContext.Provider, { value }, el));

  it('is the one box over the list, with no second search button in the header', () => {
    expect(inChats(createElement(GroupsHead, { current: undefined, onFind: () => {} }))).not.toContain('gc-find');
    expect(inChats(createElement(ChatsColumn, { current: 'room:r1' }))).toContain('class="cx-search"');
  });
  it('shows G on the box, since G is how you reach it', () => {
    expect(inChats(createElement(ChatsColumn, { current: 'room:r1' }))).toMatch(/class="cx-search"[\s\S]*?<kbd>G<\/kbd><\/label>/);
  });
  it('keeps the finder button on the Groups page, which has no box', () => {
    expect(renderToStaticMarkup(createElement(GroupsHead, { current: undefined, onFind: () => {} }))).toContain('gc-find');
  });
  it('G goes to the box when it is on the screen, and to the finder otherwise', () => {
    const hook = read('../renderer/src/team/rooms/useRooms.tsx');
    expect(hook).toMatch(/const findGroup = \(\) => \{ const box = document\.querySelector<HTMLInputElement>\('\.cx-search input'\); if \(box\) box\.focus\(\); else setFinderOpen\(true\); \};/);
    expect(hook).toContain('findGroup: live ? findGroup : null');
  });
  it('G reaches the box on an AI teammate’s chat too', () => {
    const app = read('../renderer/src/App.tsx');
    const mates = app.slice(app.indexOf('if (teammatesShown && e.key'), app.indexOf('if (connectionsShown && e.key'));
    expect(mates).toMatch(/e\.key === 'g' \|\| e\.key === 'G'[\s\S]{0,120}\.cx-search input/);
  });
});

describe('the day and New lines in a group chat', () => {
  const css = read('../renderer/src/team/rooms/rooms.css');
  const rule = (sel) => {
    const at = css.indexOf(`\n${sel} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };
  it('say the day in sentence case between two lines, as a teammate chat does', () => {
    expect(rule('.rm-day')).toMatch(/display: flex/);
    expect(css).toMatch(/\n\.rm-day::before, \.rm-day::after \{[^}]*background: var\(--line\)/);
    expect(rule('.rm-day .rm-label')).toMatch(/text-transform: none/);
    expect(rule('.rm-day .rm-label')).toMatch(/font: inherit/);
  });
  it('say New the same way, in the accent', () => {
    expect(rule('.rm-new')).not.toMatch(/uppercase|var\(--mono\)/);
    expect(rule('.rm-new')).toMatch(/color: var\(--accent\)/);
    expect(css).toMatch(/\n\.rm-new::before, \.rm-new::after \{/);
  });
});
