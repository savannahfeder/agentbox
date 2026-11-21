// A CHAT OPENED FROM NEEDS YOU STAYS IN THE INBOX (w-1d47bc5339).
//
// "When I'm in the inbox and then I click on a thread, it brings me into the
// Teams page." A teammate's message in a chat is a row in Needs you, and
// pressing it opened the chat as the Team page. Measured on the stand-in team
// (scripts/lib/groups-stage.mjs) with a message from Maya in your chat with
// her: after the press the Team list (`.cx-list`) was down the left, the bar
// read "Team", the sidebar lit Team, and Esc stayed there. Now it opens where
// the list was, as a thread does: no Team list, "Inbox / Maya Chen" in the bar,
// Inbox lit, and Back or Esc returns to the list. A chat opened from the Team
// page is still on the Team page.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { sameStop, stopOnScreen } from '../renderer/src/back-and-forward.ts';
import { readPlace } from '../renderer/src/where-she-was.ts';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { /* skipped below */ }
const browserAvailable = !!chromium && fs.existsSync(chromium.executablePath());
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../renderer/src/App.tsx');

let browser;
let page;
beforeAll(async () => {
  if (!browserAvailable) return;
  const bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { flushSync } from 'react-dom';
      import { createRoot } from 'react-dom/client';
      import { useRooms } from './renderer/src/team/rooms/useRooms';
      import { MentionRows } from './renderer/src/team/rooms/MentionRows';
      import { ChatsContext } from './renderer/src/teammates/ChatsColumn';
      const NOW = Date.parse('2026-11-21T16:00:00Z');
      const card = (id, name, o = {}) => ({ id, me: false, name, avatarUrl: null, headline: null, bio: null, agents: 0, hoursTotal: 0, hoursWeek: 0,
        hoursToday: 0, streak: 0, byMonth: [], teammate: true, showActivity: true, status: null, workingOn: null, workingPrivate: false, ...o });
      const me = card('p-me', 'Sam Rivera', { me: true });
      const maya = card('p-maya', 'Maya Chen');
      const priya = card('p-priya', 'Priya Nair');
      const room = (id, name, wall, o = {}) => ({ id, name, kind: 'group', teamId: null, listed: false, inviteOnly: false, role: 'owner', members: wall.length,
        createdAt: 0, pinned: false, muted: false, unread: 1, readAt: 0, lastAt: NOW - 60000, agents: 0, wall,
        people: wall.map((c) => ({ id: c.id, name: c.name, avatarUrl: null })), ...o });
      const said = (id, roomId, by, body, ago) => ({ id, roomId, by, body, inReplyTo: null, mentions: [], at: NOW - ago, reactions: {} });
      const asked = (roomId, roomName, messageId, by, byName, body, ago) => ({ id: 'room-mention:' + roomId, messageId, roomId, roomName, by, byName, body, at: NOW - ago, unread: true, thread: null });
      const rooms = {
        on: true, ready: true, me: null, ranks: {}, invites: [], error: null,
        rooms: [room('r-team', 'Northwind', [me, maya, priya], { kind: 'room', teamId: 't-1', pinned: true }),
          room('r-maya', 'Maya C.', [me, maya]), room('r-three', 'Maya C., Priya N.', [me, maya, priya])],
        messages: {
          'r-team': [said('t1', 'r-team', 'p-priya', 'Standup at ten.', 7200000)],
          'r-maya': [said('m1', 'r-maya', 'p-maya', 'Sam, can you check the refund copy before 5?', 240000)],
          'r-three': [said('h1', 'r-three', 'p-priya', 'Sam, who owns the billing email?', 300000)],
        },
        mentions: [asked('r-maya', 'Maya C.', 'm1', 'p-maya', 'Maya Chen', 'Sam, can you check the refund copy before 5?', 240000),
          asked('r-three', 'Maya C., Priya N.', 'h1', 'p-priya', 'Priya Nair', 'Sam, who owns the billing email?', 300000),
          asked('r-team', 'Northwind', 't1', 'p-priya', 'Priya Nair', 'Standup at ten.', 7200000)],
      };
      let ui;
      // As App.tsx places them: the heading and the chat's options in the bar, and the chat where the list was.
      function Harness() {
        ui = useRooms({ rooms, on: true, meId: 'p-me', myName: 'Sam', hasTeam: true, team: [], directs: [], now: NOW,
          toast() {}, onOpenDirect() {}, onTeamMessage() {}, onLeavePage() {}, renderBoard: () => <div className="the-board" /> });
        return <>
          <header className="topbar">{ui.heading ? ui.heading.title : <h1 className="workspace-title">Inbox</h1>}{ui.viewButton}</header>
          <main className="list-pane">{ui.page ?? <MentionRows mentions={ui.mentions} faces={ui.faces} now={NOW} onOpen={(m) => ui.openMention(m, 'inbox')} />}</main>
        </>;
      }
      const chats = { teammates: [], groups: [], now: NOW, onTeammate() {}, onNew() {}, onGroup() {}, onTeam() {} };
      const root = createRoot(document.getElementById('root'));
      flushSync(() => root.render(<ChatsContext.Provider value={chats}><Harness /></ChatsContext.Provider>));
      window.act = (step) => flushSync(() => { new Function('ui', step)(ui); });
      window.state = () => ({ openId: ui.openId, inInbox: ui.inInbox });`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1512, height: 945 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://inbox.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://inbox.test/');
  await page.addScriptTag({ content: bundle });
}, 60_000);
afterAll(async () => { await browser?.close(); });

const drawn = () => page.evaluate(() => ({
  ...window.state(),
  teamList: !!document.querySelector('.cx-list'),
  teamTitle: !!document.querySelector('.gc-col-title'),
  chat: document.querySelector('.gr-chat')?.textContent ?? null,
  people: !!document.querySelector('.gr-side'),
  crumb: document.querySelector('.thread-crumb')?.textContent ?? null,
  back: document.querySelector('.thread-crumb-back')?.getAttribute('aria-label') ?? null,
  rows: document.querySelectorAll('.rm-mention').length,
}));
const act = async (step: string) => { await page.evaluate((s) => window.act(s), step); };
const press = async (sel: string) => { await page.locator(sel).first().click(); };
// Each case starts on the list, whatever the one before it left open.
beforeEach(async () => { if (page) await act('ui.leave()'); });

describe.skipIf(!browserAvailable)('a chat pressed in Needs you', () => {
  it('starts on the list', async () => {
    expect(await drawn()).toMatchObject({ openId: null, rows: 3, chat: null });
  });

  it('opens where the list was, with no Team list, under the bar a thread from the inbox has', async () => {
    await press('.rm-mention >> nth=0');
    const d = await drawn();
    expect(d).toMatchObject({ openId: 'r-maya', inInbox: true, teamList: false, teamTitle: false, people: false, rows: 0 });
    expect(d.chat).toContain('Sam, can you check the refund copy before 5?');
    expect(d.chat).toContain('Maya Chen is waiting on you here');
    expect(d.crumb).toBe('Inbox/Maya Chen');
    expect(d.back).toBe('Back to Inbox (esc)');
  });

  it('goes back to the list from the bar', async () => {
    await press('.rm-mention >> nth=0');
    await press('.thread-crumb-back');
    expect(await drawn()).toMatchObject({ openId: null, inInbox: false, rows: 3, crumb: null, chat: null });
  });

  it('still lists who is in a chat of three, as a chat drawn on its own does', async () => {
    await press('.rm-mention >> nth=1');
    expect(await drawn()).toMatchObject({ openId: 'r-three', inInbox: true, teamList: false, people: true, crumb: 'Inbox/Maya Chen, Priya Nair' });
  });

  // Without this the board drew the thread's tall bar with the Team page's title in it.
  it('keeps the same bar one step in, naming the chat Back goes to', async () => {
    await press('.rm-mention >> nth=2');
    expect(await drawn()).toMatchObject({ openId: 'r-team', inInbox: true, crumb: 'Inbox/Northwind' });
    await press('button[aria-label="Group options"]');
    await press('text=Everyone’s threads');
    expect(await drawn()).toMatchObject({ openId: 'r-team', inInbox: true, teamList: false, crumb: 'Northwind/Everyone’s threads', back: 'Back to Northwind (esc)' });
    await press('.thread-crumb-back');
    expect(await drawn()).toMatchObject({ openId: 'r-team', inInbox: true, crumb: 'Inbox/Northwind' });
  });
});

describe.skipIf(!browserAvailable)('a chat opened from the Team page', () => {
  it('is still on the Team page, with its list and its title', async () => {
    await act("ui.open('r-maya')");
    expect(await drawn()).toMatchObject({ openId: 'r-maya', inInbox: false, teamList: true, teamTitle: true, crumb: null });
  });

  it('is on the Team page when a mention is opened from there too', async () => {
    await act('ui.openMention(ui.mentions[0])');
    expect(await drawn()).toMatchObject({ openId: 'r-maya', inInbox: false, teamList: true, crumb: null });
  });

  it('is on the Team page once another chat is picked from its list, after one opened in the inbox', async () => {
    await press('.rm-mention >> nth=0');
    await act("ui.pickGroup('room:r-three')");
    expect(await drawn()).toMatchObject({ openId: 'r-three', inInbox: false, teamList: true, crumb: null });
  });
});

describe('back and forward', () => {
  const screen = (over = {}) => stopOnScreen({
    settings: null, thread: null, card: null, home: false, files: null, connections: false,
    group: null, teammate: null, teamPlace: null, unrecorded: false, view: 'inbox', ...over,
  });
  it('keep a chat opened in the inbox as one in the inbox, and one on the Team page as before', () => {
    expect(screen({ group: 'g1', groupInInbox: true })).toEqual({ at: 'group', id: 'g1', inbox: true });
    expect(screen({ group: 'g1' })).toEqual({ at: 'group', id: 'g1' });
  });
  it('tell the same chat in the inbox and on the Team page apart', () => {
    expect(sameStop({ at: 'group', id: 'g1', inbox: true }, { at: 'group', id: 'g1' })).toBe(false);
    expect(sameStop({ at: 'group', id: 'g1', inbox: true }, { at: 'group', id: 'g1', inbox: true })).toBe(true);
    expect(sameStop({ at: 'group', id: 'g1', inbox: true }, { at: 'group', id: 'g2', inbox: true })).toBe(false);
  });
});

describe('a reload', () => {
  const place = (v: unknown) => readPlace({ getItem: () => JSON.stringify(v) });
  it('keeps that a chat was open in the inbox', () => {
    expect(place({ view: 'inbox', room: 'r-maya', roomInInbox: true })).toMatchObject({ room: 'r-maya', roomInInbox: true });
  });
  it('reads nothing else as that', () => {
    expect(place({ view: 'inbox', room: 'r-maya' })?.roomInInbox).toBeUndefined();
    expect(place({ view: 'inbox', room: 'r-maya', roomInInbox: 'yes' })?.roomInInbox).toBeUndefined();
  });
});

describe('in the app', () => {
  it('opens a chat in the inbox from its row, its card on the board, Enter on it, and Home', () => {
    expect(app).toContain("<MentionRows key={l.key} mentions={[l.mention!]} faces={roomsUi.faces} now={now} onOpen={(m) => roomsUi.openMention(m, 'inbox')}");
    expect(app).toContain("<MentionCards key={l.key} mentions={[l.mention!]} onOpen={(m) => roomsUi.openMention(m, 'inbox')}");
    expect(app).toMatch(/if \(l\.invite\) void joinInvite\(l\.invite\);\s*else if \(l\.mention\) roomsUi\.openMention\(l\.mention, 'inbox'\);/);
    expect(app).toContain("lead: (l) => { if (l.mention) roomsUi.openMention(l.mention, 'inbox'); else openInvite(); },");
  });

  it('lights the Inbox in the sidebar while one is open there, and Team only for one on the Team page', () => {
    expect(app).toContain('const roomOnTeam = roomShown && !roomsUi.inInbox;');
    expect(app).toContain('roomsUi.sidebarGroups(roomOnTeam || directOpen || teammatesShown || chatsPlaceShown || cardFromPlace,');
    expect(app).toContain('onGroupsPage={roomOnTeam || directOpen || chatsPlaceShown || cardFromPlace}');
  });

  it('draws the bar of a thread opened from the inbox, with its Inbox button', () => {
    expect(app).toContain("${roomShown && roomsUi.inInbox ? ' workspace-task' : ''}");
    expect(app).toContain('const onInboxThread = (!!focused && !settingsOpen && !inChats) || (roomShown && roomsUi.inInbox);');
  });

  it('goes back and forward to it in the inbox, and a reload reopens it there', () => {
    expect(app).toMatch(/groupInInbox: roomShown && roomsUi\.inInbox,/);
    expect(app).toContain("else if (s.at === 'group') { openView(view); roomsUi.open(s.id, s.inbox ? 'inbox' : null); }");
    expect(app).toContain('if (roomsUi.openId && roomsUi.openId !== \'groups\' && roomsUi.inInbox) place.roomInInbox = true;');
    expect(app).toContain("if (place.room) roomsUi.open(place.room, place.roomInInbox ? 'inbox' : null);");
  });
});
