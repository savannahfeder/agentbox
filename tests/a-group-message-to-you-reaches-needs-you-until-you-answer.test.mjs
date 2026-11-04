// A GROUP MESSAGE TO YOU REACHES NEEDS YOU, AND STAYS UNTIL YOU ANSWER.
//
// All eight of Lumen's group messages had an empty mention list, because
// people type "Dev, can you…" and do not use the @ menu. None reached anyone's
// Needs you, and opening the group cleared the few that did, so an unanswered
// ask vanished on a glance. Later a reply
// in a group's side thread did not move the row or say who wrote it.
//
// The rule, the row it makes, and the row's whole life on two Macs over the
// in-memory cloud.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addressedByOpening, mentionsIn, groupRow } from '../shared/room-needs-you.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mjs';
import { MentionRows } from '../renderer/src/team/rooms/MentionRows.tsx';
import { GroupWaits } from '../renderer/src/team/rooms/GroupPage.tsx';

const DEV = { id: 'p-dev', name: 'Dev' };
const MAYA = { id: 'p-maya', name: 'Maya' };
const SOFIA = { id: 'p-sofia', name: 'Sofia R.' };
const PEOPLE = [DEV, MAYA, SOFIA];
const opens = (body, people = PEOPLE) => addressedByOpening(body, people).sort();

describe('your name opening a sentence, line or list item, followed by a comma or colon', () => {
  it.each([
    ['Dev, can you look at this?', ['p-dev']],
    ['dev, can you look at this?', ['p-dev']],
    ['Dev: the bug', ['p-dev']],
    ['1) Dev: the bug', ['p-dev']],
    ['1. Dev: the bug', ['p-dev']],
    ['- Dev: the bug', ['p-dev']],
    ['**Dev:** the bug', ['p-dev']],
    ['**Dev**: the bug', ['p-dev']],
    ['Plan for today.\nDev, the bug.\nSofia R.: the mock', ['p-dev', 'p-sofia']],
    ['That shipped. Dev, can you check it?', ['p-dev']],
    ['Maya, Sofia: could you both look', ['p-maya', 'p-sofia']],
    ['Maya and Dev, could you both look', ['p-dev', 'p-maya']],
    ['Sofia, can you', ['p-sofia']],
  ])('%s', (body, want) => { expect(opens(body)).toEqual(want); });
});

describe('your name anywhere else', () => {
  it.each([
    'Dev is on the bug',
    "Dev's fix went out",
    'Thanks Sofia, that helped',
    'Ask Dev, he knows',
    'I talked to Dev: he agrees',
    'Developers, take note',
    'Dev and Sofia are on it',
    '> Dev, can you look at this?',
    '',
  ])('%s does not count', (body) => { expect(opens(body)).toEqual([]); });

  it('a first name two people share names neither, and the full name still does', () => {
    const two = [{ id: 'a', name: 'Sam R.' }, { id: 'b', name: 'Sam T.' }];
    expect(addressedByOpening('Sam, can you', two)).toEqual([]);
    expect(addressedByOpening('Sam T., can you', two)).toEqual(['b']);
  });
});

describe('@dev typed in the words', () => {
  it('names them without the @ menu', () => { expect(mentionsIn('can you look @dev?', PEOPLE)).toEqual(['p-dev']); });
  it('does not name them inside another word', () => { expect(mentionsIn('mail a@dev.io', PEOPLE)).toEqual([]); });
});

const said = (id, by, body, at, over = {}) => ({ id, roomId: 'r', by, body, at, mentions: [], inReplyTo: null, ...over });
const row = (messages, over = {}) => groupRow({ roomId: 'r', roomName: 'Lumen', messages, mentioned: [], me: 'p-dev', people: PEOPLE, doneAt: 0, readAt: 0, nameOf: (id) => PEOPLE.find((p) => p.id === id)?.name ?? '', ...over });

describe('a group row', () => {
  it('is nothing when nobody addressed you', () => {
    expect(row([said('1', 'p-maya', 'Dev is on the bug', 10)])).toBeNull();
  });

  it('comes from the @ menu, a typed @, an opening name or a reply to you', () => {
    expect(row([said('1', 'p-maya', 'look', 10, { mentions: ['p-dev'] })])).not.toBeNull();
    expect(row([said('1', 'p-maya', 'look @dev', 10)])).not.toBeNull();
    expect(row([said('1', 'p-maya', 'Dev, look', 10)])).not.toBeNull();
    expect(row([said('1', 'p-dev', 'shipped', 10), said('2', 'p-maya', 'nice', 11, { inReplyTo: '1' })])).not.toBeNull();
  });

  it('is not your own message addressing yourself', () => {
    expect(row([said('1', 'p-dev', 'Dev, remember this', 10)])).toBeNull();
  });

  it('is not a reply to somebody else in a thread you are not in', () => {
    expect(row([said('1', 'p-maya', 'shipped', 10), said('2', 'p-sofia', 'nice', 11, { inReplyTo: '1' })])).toBeNull();
  });

  it('shows the newest words in the group and who wrote them, whoever was addressed', () => {
    const r = row([said('1', 'p-maya', 'Dev, the bug?', 10), said('2', 'p-sofia', 'I can pair on it', 12)]);
    expect(r).toMatchObject({ id: 'room-mention:r', roomId: 'r', by: 'p-sofia', byName: 'Sofia R.', body: 'I can pair on it', at: 12, messageId: '2', thread: null });
  });

  it('ends when you write in the group, and comes back on the next message to you', () => {
    const asked = said('1', 'p-maya', 'Dev, the bug?', 10);
    const answered = said('2', 'p-dev', 'On it', 11);
    expect(row([asked, answered])).toBeNull();
    expect(row([asked, answered, said('3', 'p-sofia', 'thanks', 12)])).toBeNull();
    expect(row([asked, answered, said('3', 'p-sofia', 'Dev, and this?', 12)])).toMatchObject({ body: 'Dev, and this?' });
  });

  it('ends at Mark done, and only for what came before it', () => {
    const asked = said('1', 'p-maya', 'Dev, the bug?', 10);
    expect(row([asked], { doneAt: 10 })).toBeNull();
    expect(row([asked], { doneAt: 9 })).not.toBeNull();
    expect(row([asked, said('2', 'p-maya', 'Dev, one more', 11)], { doneAt: 10 })).toMatchObject({ body: 'Dev, one more' });
  });

  it('does not end because you read the group', () => {
    expect(row([said('1', 'p-maya', 'Dev, the bug?', 10)], { readAt: 99 })).toMatchObject({ unread: false });
    expect(row([said('1', 'p-maya', 'Dev, the bug?', 10)], { readAt: 9 })).toMatchObject({ unread: true });
  });

  it('skips a deleted message', () => {
    expect(row([said('1', 'p-maya', '', 10, { deleted: true, mentions: [] })])).toBeNull();
  });

  it('finds a mention older than the messages held', () => {
    const r = row([said('9', 'p-sofia', 'noise', 50)], { mentioned: [said('1', 'p-maya', 'look', 10, { mentions: ['p-dev'] })] });
    expect(r).toMatchObject({ body: 'noise', at: 50 });
  });
});

describe('a reply in a group\'s side thread', () => {
  it('moves the row and says who replied, in your thread', () => {
    const r = row([said('1', 'p-dev', 'shipped', 10), said('2', 'p-sofia', 'looks right', 20, { inReplyTo: '1' })]);
    expect(r).toMatchObject({ at: 20, byName: 'Sofia R.', body: 'looks right', thread: 'yours' });
  });

  it('counts in a thread you replied in, as a thread that is not yours', () => {
    const r = row([said('1', 'p-maya', 'who has this', 10), said('2', 'p-dev', 'me', 11, { inReplyTo: '1' }), said('3', 'p-sofia', 'thanks', 20, { inReplyTo: '1' })]);
    expect(r).toMatchObject({ at: 20, byName: 'Sofia R.', thread: 'theirs' });
  });

  it('is what the row says when it is the newest thing in a row that is already there', () => {
    const r = row([said('1', 'p-maya', 'Dev, the bug?', 10), said('2', 'p-maya', 'Sofia, the mock', 11), said('3', 'p-sofia', 'sent', 20, { inReplyTo: '2' })]);
    expect(r).toMatchObject({ at: 20, byName: 'Sofia R.', thread: 'theirs' });
  });
});

const NOW = Date.UTC(2026, 9, 30, 12);
const draw = (rows) => renderToStaticMarkup(React.createElement(MentionRows, { mentions: rows, faces: new Map(), now: NOW, onOpen: () => {} }));
const drawn = (over = {}) => ({ id: 'room-mention:r', messageId: '1', roomId: 'r', roomName: 'Lumen', by: 'p-maya', byName: 'Maya', body: 'Dev, the bug?', at: NOW - 60_000, thread: null, unread: true, ...over });

describe('the row on screen', () => {
  it('says the words and who wrote them', () => {
    const html = draw([drawn()]);
    expect(html).toContain('<b class="th-msg-who">Maya</b>');
    expect(html).toContain('>Dev, the bug?<');
  });

  it('says a thread reply is one', () => {
    expect(draw([drawn({ thread: 'yours', byName: 'Sofia', body: 'looks right' })])).toContain('>in your thread: looks right<');
    expect(draw([drawn({ thread: 'theirs', byName: 'Sofia', body: 'looks right' })])).toContain('>in a thread: looks right<');
  });

  it('wears the new mark only while unread', () => {
    expect(draw([drawn()])).toMatch(/class="row rm-mention unread"/);
    expect(draw([drawn({ unread: false })])).not.toMatch(/rm-mention unread/);
  });
});

describe('above the group\'s chat', () => {
  const bar = (row) => renderToStaticMarkup(React.createElement(GroupWaits, { row, onDone: () => {} }));
  it('Mark done sits there while the group waits on you', () => {
    const html = bar(drawn());
    expect(html).toContain('Maya is waiting on you here');
    expect(html).toMatch(/<button[^>]*>Mark done<\/button>/);
  });
  it('and nothing does otherwise', () => { expect(bar(null)).toBe(''); });
});

// The whole life, on two Macs over the in-memory cloud.
const T0 = Date.UTC(2026, 9, 30, 9);
const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
const timers = { setTimeout: (fn) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h) => { if (h) h.off = true; } };

function world() {
  const cloud = createMemoryCloud();
  let clock = T0;
  cloud.now = () => clock;
  const mk = (name, email) => {
    const id = signUpMemory(cloud, { email, name });
    const backend = memoryBackend(cloud, id);
    const p = { id, name, backend, teamState: { team: null, people: [], cards: [] } };
    p.prefsFile = roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), `rooms-${name}-`)));
    p.make = () => createRooms({
      backend: () => backend, me: () => ({ id, name, avatarUrl: null, status: null }), team: () => p.teamState, enabled: () => true,
      device: () => '0123456789ab', presenceFacts: () => ({ running: [], items: [], products: [], summary: { total: 0, week: 0, weekStart: '2026-10-26', today: 0, day: '2026-10-30', streak: 0, activeDays: [], byMonth: [] } }),
      prefsFile: p.prefsFile, now: () => clock, timers,
    });
    p.rooms = p.make();
    return p;
  };
  return { cloud, maya: mk('Maya', 'maya@lumen.test'), dev: mk('Dev', 'dev@lumen.test'), tick: (ms = 60_000) => { clock += ms; } };
}

describe('on two Macs', () => {
  let w; let room;
  beforeEach(async () => {
    w = world();
    await w.maya.rooms.start();
    await w.dev.rooms.start();
    room = await w.maya.rooms.create({ name: 'Lumen' });
    await w.maya.rooms.invite(room, 'dev@lumen.test');
    await w.dev.rooms.refresh();
    await w.dev.rooms.acceptInvite(room);
    await w.maya.rooms.refresh();
    await flush();
  });
  const rows = () => w.dev.rooms.state().mentions;

  it('a name typed with no @ menu is a row, on one row however many arrive', async () => {
    await w.maya.rooms.send(room, 'Dev, can you look at the bug?');
    w.tick();
    await w.maya.rooms.send(room, 'Dev, and the docs');
    await flush();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ id: `room-mention:${room}`, byName: 'Maya', body: 'Dev, and the docs', roomName: 'Lumen' });
  });

  it('reading the group leaves it; replying clears it', async () => {
    await w.maya.rooms.send(room, 'Dev, can you look?');
    await flush();
    await w.dev.rooms.markRead(room);
    await w.dev.rooms.refresh();
    expect(rows()).toHaveLength(1);
    w.tick();
    await w.dev.rooms.send(room, 'On it');
    expect(rows()).toEqual([]);
  });

  it('Mark done clears it, on this Mac through a restart, and the next message to you brings it back', async () => {
    await w.maya.rooms.send(room, 'Dev, can you look?');
    await flush();
    await w.dev.rooms.markDone(room);
    expect(rows()).toEqual([]);
    await w.dev.rooms.stop();
    w.dev.rooms = w.dev.make();
    await w.dev.rooms.start();
    expect(rows()).toEqual([]);
    w.tick();
    await w.maya.rooms.send(room, 'Dev, one more');
    await flush();
    expect(rows()).toHaveLength(1);
  });

  it('a message that crossed your Mark done still reaches you', async () => {
    await w.maya.rooms.send(room, 'Dev, can you look?');
    await flush();
    await w.dev.rooms.markDone(room);
    expect(rows()).toEqual([]);
    w.tick(1);
    await w.maya.rooms.send(room, 'Dev, sent a moment after');
    await flush();
    expect(rows().map((r) => r.body)).toEqual(['Dev, sent a moment after']);
  });

  it('a mention stays under two hundred newer messages', async () => {
    await w.maya.rooms.send(room, 'look at this', { mentions: [w.dev.id] });
    w.tick();
    for (let i = 0; i < 210; i += 1) {
      if (i % 20 === 0) w.tick(61_000);
      await w.maya.backend.sendRoomMessage(room, { body: `note ${i}` });
    }
    w.tick();
    await w.maya.backend.sendRoomMessage(room, { body: 'the newest' });
    await w.dev.rooms.refresh();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].body).toBe('the newest');
  });

  // Seen on screen: a group invitation sat unseen on a running copy, because
  // an invitation makes no event and only a restart read them.
  it('a group invitation reaches a copy already running, on its next pass, and leaves once taken up', async () => {
    const second = await w.maya.rooms.create({ name: 'Design' });
    await w.maya.rooms.invite(second, 'dev@lumen.test');
    await flush();
    expect(w.dev.rooms.state().invites).toEqual([]);
    await w.dev.rooms.tick();
    expect(w.dev.rooms.state().invites.map((i) => i.roomName)).toEqual(['Design']);
    await w.dev.rooms.acceptInvite(second);
    expect(w.dev.rooms.state().invites).toEqual([]);
  });

  it('a pass with no new invitation redraws nothing', async () => {
    let drawn = 0;
    const quiet = createRooms({
      backend: () => w.dev.backend, me: () => ({ id: w.dev.id, name: 'Dev', avatarUrl: null, status: null }), team: () => w.dev.teamState, enabled: () => true,
      device: () => '0123456789ab', presenceFacts: () => ({ running: [], items: [], products: [], summary: { total: 0, week: 0, weekStart: '2026-10-26', today: 0, day: '2026-10-30', streak: 0, activeDays: [], byMonth: [] } }),
      prefsFile: w.dev.prefsFile, now: () => T0, timers, onChange: () => { drawn += 1; },
    });
    await quiet.start();
    await flush();
    drawn = 0;
    await quiet.tick();
    expect(drawn).toBe(0);
    await quiet.stop();
  });

  it('a side-thread reply to me says who wrote it', async () => {
    const mine = await w.dev.rooms.send(room, 'shipped');
    w.tick();
    await w.maya.rooms.refresh();
    await w.maya.rooms.send(room, 'looks right', { inReplyTo: mine.id });
    await flush();
    expect(rows()[0]).toMatchObject({ byName: 'Maya', body: 'looks right', thread: 'yours' });
  });
});
