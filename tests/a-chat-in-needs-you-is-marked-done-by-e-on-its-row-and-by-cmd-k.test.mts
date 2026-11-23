// A CHAT IN NEEDS YOU IS MARKED DONE BY E ON ITS ROW AND BY ⌘K (w-abaabc85e2).
//
// "I'm trying to mark this thread as done and it doesn't seem to work. It's
// just a chat. Before, I swear I could have done this but the command's not
// coming up." A chat with a teammate waiting on you is a row at the top of
// Needs you, but it is not a task: E and ⌘K only knew tasks. Measured on the
// stand-in team (scripts/lib/groups-stage.mjs): with the chat open from Needs
// you, ⌘K and "done" offered a thread whose text said "done" and Go to In
// progress, and no Mark done; with the keyboard on the chat's row in the
// list, E did nothing and ⌘K offered no command for it. Only the small Mark
// done in the chat's banner worked, and it left you in the chat.
//
// Now the chat's row takes E and ⌘K's Mark done, the open chat's ⌘K offers
// Mark done (its box has the caret, so E there is still a letter), and a
// chat marked done from the inbox goes back to the list, as a closed thread
// does. The row leaves on the press, not when the Mac's next picture of the
// rooms comes in; a newer message brings it back.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { notMarkedDone } from '../renderer/src/team/rooms/chats-marked-done.ts';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { /* skipped below */ }
const browserAvailable = !!chromium && fs.existsSync(chromium.executablePath());
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

const row = (roomId: string, at: number) => ({ id: `room-mention:${roomId}`, messageId: `m-${at}`, roomId, roomName: roomId, by: 'p-maya', byName: 'Maya', body: 'Can you look?', at });

describe('which chat rows are still waiting', () => {
  it('leaves out a chat marked done, and its older rows, but not a message that came after', () => {
    const rows = [row('r-maya', 100), row('r-maya', 90), row('r-theo', 80)];
    expect(notMarkedDone(rows, { 'r-maya': 100 }).map((r) => r.roomId)).toEqual(['r-theo']);
    expect(notMarkedDone([row('r-maya', 101)], { 'r-maya': 100 })).toHaveLength(1);
  });

  it('keeps every row when nothing was marked done', () => {
    expect(notMarkedDone([row('r-maya', 100)], {})).toHaveLength(1);
  });
});

let browser;
let page;
beforeAll(async () => {
  if (!browserAvailable) return;
  const bundle = (await build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { flushSync } from 'react-dom';
      import { createRoot } from 'react-dom/client';
      import { useRooms } from './renderer/src/team/rooms/useRooms';
      import { useChatsMarkedDone } from './renderer/src/team/rooms/chats-marked-done';
      import { MentionRows } from './renderer/src/team/rooms/MentionRows';
      import { ChatsContext } from './renderer/src/teammates/ChatsColumn';
      const NOW = Date.parse('2026-11-23T16:00:00Z');
      const card = (id, name, o = {}) => ({ id, me: false, name, avatarUrl: null, headline: null, bio: null, agents: 0, hoursTotal: 0, hoursWeek: 0,
        hoursToday: 0, streak: 0, byMonth: [], teammate: true, showActivity: true, status: null, workingOn: null, workingPrivate: false, ...o });
      const me = card('p-me', 'Sam Rivera', { me: true });
      const maya = card('p-maya', 'Maya Chen');
      const theo = card('p-theo', 'Theo Park');
      const room = (id, name, wall) => ({ id, name, kind: 'group', teamId: null, listed: false, inviteOnly: false, role: 'owner', members: wall.length,
        createdAt: 0, pinned: false, muted: false, unread: 1, readAt: 0, lastAt: NOW - 60000, agents: 0, wall,
        people: wall.map((c) => ({ id: c.id, name: c.name, avatarUrl: null })) });
      const said = (id, roomId, by, body, ago) => ({ id, roomId, by, body, inReplyTo: null, mentions: [], at: NOW - ago, reactions: {} });
      const asked = (roomId, roomName, messageId, by, byName, body, ago) => ({ id: 'room-mention:' + roomId, messageId, roomId, roomName, by, byName, body, at: NOW - ago, unread: true, thread: null });
      const first = () => ({
        on: true, ready: true, me: null, ranks: {}, invites: [], error: null,
        rooms: [room('r-maya', 'Maya C.', [me, maya]), room('r-theo', 'Theo P.', [me, theo]), room('r-quiet', 'Theo P., Maya C.', [me, theo, maya])],
        messages: {
          'r-maya': [said('m1', 'r-maya', 'p-maya', 'Can you read the refund copy before Friday?', 240000)],
          'r-theo': [said('t1', 'r-theo', 'p-theo', 'Want a build of the phone app?', 300000)],
          'r-quiet': [said('q1', 'r-quiet', 'p-me', 'Thanks both.', 600000)],
        },
        mentions: [asked('r-maya', 'Maya C.', 'm1', 'p-maya', 'Maya Chen', 'Can you read the refund copy before Friday?', 240000),
          asked('r-theo', 'Theo P.', 't1', 'p-theo', 'Theo Park', 'Want a build of the phone app?', 300000)],
      });
      window.calls = [];
      window.answer = { ok: true, value: null };
      window.zero = { rooms: async ({ op, args }) => { window.calls.push([op, ...args]); return window.answer; } };
      window.toasts = [];
      let ui;
      let setRooms;
      // As App.tsx places them: the marks made before the rooms, the chat where the list was.
      function Harness() {
        const [rooms, set] = useState(first);
        setRooms = set;
        const chatsDone = useChatsMarkedDone();
        ui = useRooms({ rooms, on: true, meId: 'p-me', myName: 'Sam', hasTeam: true, team: [], directs: [], now: NOW, chatsDone,
          toast(t) { window.toasts.push(t); }, onOpenDirect() {}, onTeamMessage() {}, onLeavePage() {} });
        return <main className="list-pane">{ui.page ?? <MentionRows mentions={ui.mentions} faces={ui.faces} now={NOW} onOpen={(m) => ui.openMention(m, 'inbox')} />}</main>;
      }
      const chats = { teammates: [], groups: [], now: NOW, onTeammate() {}, onNew() {}, onGroup() {}, onTeam() {} };
      const root = createRoot(document.getElementById('root'));
      let copy = 0;
      const draw = () => flushSync(() => root.render(<ChatsContext.Provider value={chats}><Harness key={copy} /></ChatsContext.Provider>));
      draw();
      window.act = (step) => flushSync(() => { new Function('ui', step)(ui); });
      // A fresh copy: the rooms as they were and no marks.
      window.restart = () => { copy += 1; draw(); };
      window.newMessage = () => flushSync(() => setRooms((r) => ({ ...r, mentions: [...r.mentions, asked('r-maya', 'Maya C.', 'm2', 'p-maya', 'Maya Chen', 'One more thing.', 1000)] })));
      window.state = () => ({ openId: ui.openId, inInbox: ui.inInbox, canMarkDone: !!ui.markDoneHere });`,
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
  rows: [...document.querySelectorAll('.rm-mention')].map((r) => r.textContent),
  banner: document.querySelector('.gr-waits')?.textContent ?? null,
  calls: window.calls,
  toasts: window.toasts,
}));
const act = async (step: string) => { await page.evaluate((s) => window.act(s), step); };
const settle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 30)));
beforeEach(async () => {
  if (!page) return;
  await page.evaluate(() => { window.restart(); window.calls = []; window.toasts = []; window.answer = { ok: true, value: null }; });
});

describe.skipIf(!browserAvailable)('a chat opened from Needs you', () => {
  it('can be marked done from ⌘K, which goes back to the list without its row', async () => {
    await page.locator('.rm-mention', { hasText: 'refund copy' }).click();
    expect(await drawn()).toMatchObject({ openId: 'r-maya', inInbox: true, canMarkDone: true });
    await act('ui.markDoneHere()');
    await settle();
    const d = await drawn();
    expect(d).toMatchObject({ openId: null, calls: [['markDone', 'r-maya']] });
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toContain('phone app');
  });

  it('goes back to the list from the Mark done in its banner too', async () => {
    await page.locator('.rm-mention', { hasText: 'refund copy' }).click();
    await page.locator('.gr-waits button', { hasText: 'Mark done' }).click();
    await settle();
    const d = await drawn();
    expect(d).toMatchObject({ openId: null, calls: [['markDone', 'r-maya']] });
    expect(d.rows).toHaveLength(1);
  });

  it('offers no Mark done once nothing in it waits on you', async () => {
    await act("ui.open('r-quiet', 'inbox')");
    expect(await drawn()).toMatchObject({ openId: 'r-quiet', canMarkDone: false, banner: null });
  });
});

describe.skipIf(!browserAvailable)('a chat opened from the Team page', () => {
  it('stays open when marked done, with its banner gone on the press', async () => {
    await act("ui.open('r-maya')");
    expect((await drawn()).banner).toContain('waiting on you here');
    await act('ui.markDoneHere()');
    await settle();
    expect(await drawn()).toMatchObject({ openId: 'r-maya', banner: null, calls: [['markDone', 'r-maya']], canMarkDone: false });
  });
});

describe.skipIf(!browserAvailable)('a chat row in Needs you', () => {
  it('is marked done in place, as E on it does, and leaves the list on the press', async () => {
    await act('ui.markChatDone(ui.mentions.find((m) => m.roomId === "r-theo"))');
    await settle();
    const d = await drawn();
    expect(d).toMatchObject({ openId: null, calls: [['markDone', 'r-theo']] });
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toContain('refund copy');
  });

  it('comes back when a newer message arrives in that chat', async () => {
    await act('ui.markChatDone(ui.mentions.find((m) => m.roomId === "r-maya"))');
    await settle();
    expect((await drawn()).rows).toHaveLength(1);
    await page.evaluate(() => window.newMessage());
    const rows = (await drawn()).rows;
    expect(rows).toHaveLength(2);
    expect(rows.join(' ')).toContain('One more thing.');
  });

  it('comes back and says why when the mark does not go through', async () => {
    await page.evaluate(() => { window.answer = { ok: false, error: 'The team cloud did not answer.' }; });
    await act('ui.markChatDone(ui.mentions.find((m) => m.roomId === "r-maya"))');
    await settle();
    const d = await drawn();
    expect(d.rows).toHaveLength(2);
    expect(d.toasts).toEqual(['The team cloud did not answer.']);
  });
});

describe('in the app', () => {
  it('keeps a chat marked done out of the Needs you rows, from the same marks the chat reads', () => {
    expect(app).toContain('const chatsDone = useChatsMarkedDone();');
    expect(app).toMatch(/const groupRows = useMemo\(\(\) => \(snap\?\.alpha\?\.rooms && snap\?\.team\?\.rooms\?\.on \? mentionRows\(notMarkedDone\(snap\.team\.rooms\.mentions, chatsDone\.done\), snap\.team\.rooms\) : \[\]\)/);
    expect(app).toMatch(/useRooms\(\{[^]*?chatsDone,/);
  });

  it('gives ⌘K over an open chat its Mark done and nothing for a thread hidden behind it', () => {
    expect(app).toContain("if (roomShown) return roomsUi.markDoneHere ? [{ id: 'done', label: `Mark ${DONE.verb.toLowerCase()}`, run: () => { setModal(null); roomsUi.markDoneHere?.(); } }] : [];");
    // Above the ticked rows and the hidden row, which would otherwise answer.
    expect(app.indexOf('if (roomShown) return roomsUi.markDoneHere')).toBeLessThan(app.indexOf('if (multiSel.size && !focused) {'));
  });

  it('gives ⌘K on a chat row its Mark done, with E beside it', () => {
    // A phone draws no row the keyboard is on.
    expect(app).toContain("if (!target && chatRow && !onPhone()) return [{ id: 'done', label: `Mark ${DONE.verb.toLowerCase()}`, keyHint: 'E', run: () => { setModal(null); chatRowDone(chatRow); } }];");
  });

  it('marks a chat row done with E, and a task row is still closed as before', () => {
    expect(app).toMatch(/else if \(pointed && view === 'inbox'\) markDone\(pointed\);\s*else if \(chatRow && view === 'inbox'\) chatRowDone\(chatRow\);/);
  });

  // Measured on the stand-in team before this: E on the first of two chat rows
  // put the keyboard on the first thread, below the second chat, so a second E
  // closed a thread.
  it('puts the keyboard on the row under a chat row marked done', () => {
    const done = app.slice(app.indexOf('const chatRowDone = '), app.indexOf('roomsUi.markChatDone(row);'));
    expect(done).toContain('const next = at >= 0 ? heldLeads.rows[at + 1] ?? null : null;');
    expect(done).toContain('if (next) setCardSel(`lead/${next.key}`);');
  });
});
