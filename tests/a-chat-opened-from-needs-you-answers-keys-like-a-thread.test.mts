// A CHAT OPENED FROM NEEDS YOU ANSWERS KEYS LIKE A THREAD (w-ffa8449a86).
//
// "When I hit L, it just types right in the chat." A teammate's message opened
// from Needs you was the Team page's chat moved into the inbox: its box took
// the keyboard on arrival, and the room's rule sent every letter with no box
// under it into that box, so L typed "l" and E, J and K did nothing. Measured
// on the stand-in team (scripts/lib/groups-stage.mjs) at 1710 by 1107: after
// L the box read "l", and the words ran 1,650 points wide where a thread's
// column is 808, under a "waiting on you here / Mark done" strip no thread has.
//
// Now, opened from Needs you: the box waits folded with its R, nothing has the
// keyboard, J and K walk on, E is Done and L is Later, both taken back by Z,
// and a chat put off sits in Later until its moment or until they write again.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mts';
import { putOffNow } from '../shared/room-needs-you.mts';
import { stepFromChat, type PageStop } from '../renderer/src/threads/walk-rules.ts';
import { MentionRows } from '../renderer/src/team/rooms/MentionRows.tsx';

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../renderer/src/App.tsx');
const roomsCss = read('../renderer/src/team/rooms/rooms.css');
const pageCss = read('../renderer/src/one-thing-at-a-time.css');

describe('where J, K and E go from a chat', () => {
  const item = (id: string) => ({ item: { id, product: 'p' } }) as unknown as PageStop;
  const stops: PageStop[] = [{ lead: { key: 'room-mention:a' } }, { lead: { key: 'room-mention:b' } }, item('w1'), item('w2')];
  const at = (s: PageStop | null) => (s ? s.lead?.key ?? s.item?.id : null);

  it('is the row beside its own, either way', () => {
    expect(at(stepFromChat(stops, 'room-mention:b', 1, 1))).toBe('w1');
    expect(at(stepFromChat(stops, 'room-mention:b', 1, -1))).toBe('room-mention:a');
  });
  it('is beside where its row sat once a reply or Done took the row away', () => {
    const after = stops.filter((s) => s.lead?.key !== 'room-mention:b');
    expect(at(stepFromChat(after, 'room-mention:b', 1, 1))).toBe('w1');
    expect(at(stepFromChat(after, 'room-mention:b', 1, -1))).toBe('room-mention:a');
  });
  it('is nothing past either end, or with no row and no place', () => {
    expect(stepFromChat(stops, 'room-mention:a', 0, -1)).toBeNull();
    expect(stepFromChat(stops, null, 3, -1)).not.toBeNull();
    expect(stepFromChat([item('w1')], null, 1, 1)).toBeNull();
    expect(stepFromChat(stops, null, null, 1)).toBeNull();
  });
});

describe('a group put off', () => {
  const off = { until: 1_000, seen: 500 };
  it('is out of Needs you before its moment', () => { expect(putOffNow({ at: 500 }, off, 999)).toBe(true); });
  it('is back at its moment', () => { expect(putOffNow({ at: 500 }, off, 1_000)).toBe(false); });
  it('is back as soon as someone writes after it was put off', () => { expect(putOffNow({ at: 501 }, off, 600)).toBe(false); });
  it('is a group that was never put off', () => { expect(putOffNow({ at: 500 }, undefined, 600)).toBe(false); });
});

// The whole life on two Macs over the in-memory cloud. Short timers run at
// once, as the cloud's own settling does; the wake-up for a moment is kept.
const T0 = Date.UTC(2026, 10, 21, 16);
const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
type Timer = { fn: () => void; ms: number; off: boolean };
function world() {
  const cloud = createMemoryCloud();
  let clock = T0;
  cloud.now = () => clock;
  const kept: Timer[] = [];
  const timers = {
    setTimeout: (fn: () => void, ms = 0) => { const h: Timer = { fn, ms, off: false }; if (ms > 1_000) kept.push(h); else queueMicrotask(() => { if (!h.off) fn(); }); return h; },
    clearTimeout: (h: Timer | null) => { if (h) h.off = true; },
  };
  const mk = (name: string, email: string) => {
    const id = signUpMemory(cloud, { email, name });
    const backend = memoryBackend(cloud, id);
    const prefsFile = roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), `rooms-${name}-`)));
    const make = () => createRooms({
      backend: () => backend, me: () => ({ id, name, avatarUrl: null, status: null }), team: () => ({ team: null, people: [], cards: [] }), enabled: () => true,
      device: () => '0123456789ab', presenceFacts: () => ({ running: [], items: [], products: [], summary: { total: 0, week: 0, weekStart: '2026-11-16', today: 0, day: '2026-11-21', streak: 0, activeDays: [], byMonth: [] } }),
      prefsFile, now: () => clock, timers: timers as unknown as Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>,
    });
    return { id, backend, make, prefsFile, rooms: make() };
  };
  return {
    maya: mk('Maya', 'maya@lumen.test'), dev: mk('Dev', 'dev@lumen.test'),
    tick: (ms = 60_000) => { clock += ms; },
    // The newest wake-up that is still set, run as its moment arrives.
    wake: () => { const h = [...kept].reverse().find((t) => !t.off); if (h) { h.off = true; h.fn(); } return h?.ms ?? null; },
  };
}

describe('on two Macs', () => {
  let w: ReturnType<typeof world>; let room: string;
  beforeEach(async () => {
    w = world();
    await w.maya.rooms.start();
    await w.dev.rooms.start();
    room = await w.maya.backend.createRoom({ name: 'Lumen' });
    await w.maya.rooms.refresh();
    await w.maya.rooms.invite(room, 'dev@lumen.test');
    await w.dev.rooms.refresh();
    await w.dev.rooms.acceptInvite(room);
    await w.maya.rooms.refresh();
    await flush();
    await w.maya.rooms.send(room, 'Dev, can you look at the refund copy?');
    await w.dev.rooms.refresh();
    await flush();
  });
  const rows = () => w.dev.rooms.state().mentions;
  const later = () => w.dev.rooms.state().later;

  it('E answers the moment it replaced, and Z with it puts the row back', async () => {
    expect(rows()).toHaveLength(1);
    const was = await w.dev.rooms.markDone(room);
    expect(was).toBe(0);
    expect(rows()).toEqual([]);
    await w.dev.rooms.undoDone(room, was);
    expect(rows()).toHaveLength(1);
  });

  it('Z refuses a moment that is not one', async () => {
    await expect(w.dev.rooms.undoDone(room, 'soon')).rejects.toThrow();
    await expect(w.dev.rooms.undoDone(room, -1)).rejects.toThrow();
  });

  it('L takes the row out of Needs you into Later, with when it comes back', async () => {
    const until = T0 + 3 * 3_600_000;
    expect(await w.dev.rooms.later(room, until)).toBeNull();
    expect(rows()).toEqual([]);
    expect(later()).toEqual([expect.objectContaining({ roomId: room, until, body: 'Dev, can you look at the refund copy?' })]);
  });

  it('it comes back on its own at its moment', async () => {
    await w.dev.rooms.later(room, T0 + 3 * 3_600_000);
    w.tick(3 * 3_600_000);
    expect(w.wake()).toBeGreaterThan(3 * 3_600_000 - 1);
    expect(rows()).toHaveLength(1);
    expect(later()).toEqual([]);
  });

  it('it comes back early when they write again', async () => {
    await w.dev.rooms.later(room, T0 + 24 * 3_600_000);
    w.tick();
    await w.maya.rooms.send(room, 'Dev, it is urgent after all');
    await w.dev.rooms.refresh();
    await flush();
    expect(rows().map((r) => r.body)).toEqual(['Dev, it is urgent after all']);
    expect(later()).toEqual([]);
  });

  it('it stays put off through a restart', async () => {
    await w.dev.rooms.later(room, T0 + 3 * 3_600_000);
    await w.dev.rooms.stop();
    w.dev.rooms = w.dev.make();
    await w.dev.rooms.start();
    await flush();
    expect(rows()).toEqual([]);
    expect(later()).toHaveLength(1);
  });

  it('0 brings it back now, and Z puts it back off as it was', async () => {
    await w.dev.rooms.later(room, T0 + 3 * 3_600_000);
    const was = await w.dev.rooms.later(room, 0);
    expect(rows()).toHaveLength(1);
    expect(was).toMatchObject({ until: T0 + 3 * 3_600_000 });
    await w.dev.rooms.later(room, was!.until, was!.seen);
    expect(rows()).toEqual([]);
  });

  it('refuses a moment that is not one', async () => {
    await expect(w.dev.rooms.later(room, 'tomorrow')).rejects.toThrow();
    expect(rows()).toHaveLength(1);
  });

  it('reads the settings a Mac saved before Later, with no `later` in them', async () => {
    await w.dev.rooms.stop();
    fs.writeFileSync(w.dev.prefsFile, JSON.stringify({ [w.dev.id]: { pinned: [], muted: [], markedUnread: [], autoPinned: true, doneAt: {} } }));
    w.dev.rooms = w.dev.make();
    await w.dev.rooms.start();
    await flush();
    expect(rows()).toHaveLength(1);
    expect(later()).toEqual([]);
    await w.dev.rooms.later(room, T0 + 3_600_000);
    expect(rows()).toEqual([]);
  });
});

describe('its row in Later', () => {
  const m = { id: 'room-mention:r', messageId: 'm', roomId: 'r', roomName: 'Maya C.', by: 'p-maya', byName: 'Maya Chen', body: 'Can you look?', at: T0 - 60_000 };
  it('says Scheduled and when it comes back, where Needs you says Waiting on you', () => {
    const now = T0;
    const there = renderToStaticMarkup(React.createElement(MentionRows, { mentions: [{ ...m, until: T0 + 3 * 3_600_000 }], faces: new Map(), now, onOpen: () => {} }));
    const here = renderToStaticMarkup(React.createElement(MentionRows, { mentions: [m], faces: new Map(), now, onOpen: () => {} }));
    expect(there).toContain('Scheduled');
    expect(there).not.toContain('Waiting on you');
    expect(here).toContain('Waiting on you');
  });
});

describe('in the app', () => {
  it('a chat in the inbox takes the keys an open thread does, not the box', () => {
    const branch = app.slice(app.indexOf('if (roomsUi.inInbox && e.key !== \'Escape\') {'), app.indexOf("if (e.key === 'Escape') { e.preventDefault(); roomsUi.close(); }"));
    expect(branch).toContain('keyOnAnOpenThread({ key: e.key');
    expect(branch).toMatch(/k === 'j' \|\| k === 'k'.*walk/);
    expect(branch).toMatch(/k === 'e'.*done\(\)/);
    expect(branch).toMatch(/k === 'l'.*later\(\)/);
    expect(branch).toMatch(/k === 'z'.*undo\(\)/);
    expect(branch).toMatch(/\breturn;\s*}\s*$/);
  });
  it('Done and Later on a chat are each pushed for Z', () => {
    expect(app).toMatch(/const chatDone = async[\s\S]{0,700}pushUndo\(/);
    expect(app).toMatch(/const putChatOff = async[\s\S]{0,700}pushUndo\(/);
  });
  it('L on a chat row in Needs you opens its Later', () => {
    expect(app).toContain('else if (keyLead?.mention) openChatLaterRef.current(keyLead.mention.roomId, keyLead.mention.roomName);');
  });
  it('the bar over it is a thread’s: the arrows, Done, then its options', () => {
    expect(app).toMatch(/const chatBar = chatInInbox \? <span className="ts-top">\s*<QueueNav[\s\S]{0,400}className="ts-done"[\s\S]{0,200}\{roomsUi\.viewButton\}/);
    expect(app).toContain('teammatesUi.right : chatBar ? chatBar :');
  });
  it('Later lists the chats put off, and counts them', () => {
    expect(app).toContain("view === 'snoozed' && search === null && roomsUi.laterRows.length");
    expect(app).toContain('repeats.length + chatsLater +');
  });
  it('the chat is set on the thread page’s own column', () => {
    expect(pageCss).toContain('.app.one-at-a-time.workspace-layout:not(.doc-open) .focus-pane, .workspace-layout .gr-page.in-inbox {');
    expect(roomsCss).toContain('.gr-page.in-inbox .rm-full .rm-chat-msgs { max-width: var(--task-measure, 760px); }');
  });
});

// The chat itself, opened from Needs you and from the Team page, in a browser.
const require = createRequire(import.meta.url);
let chromium: typeof import('playwright').chromium | undefined;
try { ({ chromium } = require('playwright')); } catch { /* skipped below */ }
const browserAvailable = !!chromium && fs.existsSync(chromium.executablePath());
let browser: import('playwright').Browser | undefined;
let page: import('playwright').Page;
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
      const room = (id, name, wall, o = {}) => ({ id, name, kind: 'group', teamId: null, listed: false, inviteOnly: false, role: 'owner', members: wall.length,
        createdAt: 0, pinned: false, muted: false, unread: 1, readAt: 0, lastAt: NOW - 60000, agents: 0, wall,
        people: wall.map((c) => ({ id: c.id, name: c.name, avatarUrl: null })), ...o });
      const rooms = {
        on: true, ready: true, me: null, ranks: {}, invites: [], error: null,
        rooms: [room('r-maya', 'Maya C.', [me, maya])],
        messages: { 'r-maya': [{ id: 'm1', roomId: 'r-maya', by: 'p-maya', body: 'Sam, can you check the refund copy?', inReplyTo: null, mentions: [], at: NOW - 240000, reactions: {} }] },
        mentions: [{ id: 'room-mention:r-maya', messageId: 'm1', roomId: 'r-maya', roomName: 'Maya C.', by: 'p-maya', byName: 'Maya Chen', body: 'Sam, can you check the refund copy?', at: NOW - 240000, unread: true, thread: null }],
      };
      let ui;
      function Harness() {
        ui = useRooms({ rooms, on: true, meId: 'p-me', myName: 'Sam', hasTeam: true, team: [], directs: [], now: NOW,
          toast() {}, onOpenDirect() {}, onTeamMessage() {}, onLeavePage() {} });
        return <main>{ui.page ?? <MentionRows mentions={ui.mentions} faces={ui.faces} now={NOW} onOpen={(m) => ui.openMention(m, 'inbox')} />}</main>;
      }
      const chats = { teammates: [], groups: [], now: NOW, onTeammate() {}, onNew() {}, onGroup() {}, onTeam() {} };
      const root = createRoot(document.getElementById('root'));
      flushSync(() => root.render(<ChatsContext.Provider value={chats}><Harness /></ChatsContext.Provider>));
      window.act = (step) => flushSync(() => { new Function('ui', step)(ui); });`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium!.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1512, height: 945 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://inbox.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://inbox.test/');
  await page.addScriptTag({ content: bundle });
}, 60_000);
afterAll(async () => { await browser?.close(); });

const box = () => page.evaluate(() => ({
  folded: !!document.querySelector('.rm-compose.folded'),
  key: document.querySelector('.rm-fold-key')?.textContent ?? null,
  typing: !!document.activeElement?.closest('.rm-compose'),
  inbox: !!document.querySelector('.gr-page.in-inbox'),
}));
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
beforeEach(async () => { if (page) await page.evaluate(() => window.act('ui.leave()')); });

describe.skipIf(!browserAvailable)('the chat', () => {
  it('opened from Needs you, waits folded with its R and leaves the keyboard alone', async () => {
    await page.locator('.rm-mention').first().click();
    await settle();
    expect(await box()).toEqual({ folded: true, key: 'R', typing: false, inbox: true });
  });

  it('unfolds when pressed, and folds again on Esc with nothing in it', async () => {
    await page.locator('.rm-mention').first().click();
    await page.locator('.rm-compose').click();
    await settle();
    expect(await box()).toMatchObject({ folded: false, key: null, typing: true });
    await page.keyboard.press('Escape');
    await settle();
    expect(await box()).toMatchObject({ folded: true, typing: false });
  });

  it('opened on the Team page, takes the typing at once, as it always has', async () => {
    await page.evaluate(() => window.act("ui.open('r-maya')"));
    await settle();
    expect(await box()).toEqual({ folded: false, key: null, typing: true, inbox: false });
  });
});
