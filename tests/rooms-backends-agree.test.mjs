// THE IN-MEMORY ROOMS AND THE REAL ONES KEEP THE SAME RULES (w-3d0fa23ffb, 2026-10-20).
//
// The rooms service is tested against main/team/rooms-memory.mjs, which is
// only worth anything while it keeps the rules of
// 20261021000000_rooms.sql. tests/rooms-cloud-shows-each-room-only-to-its-people
// proves those rules in the database itself; this runs one scenario, through
// the app's own calls, against both.
//
// The memory run is always on. The live run needs a Supabase with the
// migrations applied (a local one: `supabase start` in cloud/), and makes
// throwaway people there:
//   ROOMS_SUPABASE_URL=http://127.0.0.1:54321 ROOMS_SUPABASE_ANON=... ROOMS_SUPABASE_SERVICE=... \
//     npx vitest run tests/rooms-backends-agree.test.mjs
import { it, expect, describe, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { supabaseBackend } from '../main/team/supabase-backend.mjs';
import { GENERAL_ROOM } from '../main/team/rooms-memory.mjs';
import { FILE_EXISTS } from '../main/team/rooms-shape.mjs';

const NAMES = ['Maya', 'Theo', 'Jun', 'Ana'];

function memoryWorld() {
  const cloud = createMemoryCloud();
  const who = {};
  const emails = {};
  for (const name of NAMES) {
    const email = `${name.toLowerCase()}@${name === 'Maya' || name === 'Theo' ? 'northwind' : 'elsewhere'}.test`;
    emails[name.toLowerCase()] = email;
    who[name.toLowerCase()] = memoryBackend(cloud, signUpMemory(cloud, { email, name }));
  }
  return { ...who, emails, cleanup: async () => {} };
}

async function liveWorld() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.ROOMS_SUPABASE_URL;
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, process.env.ROOMS_SUPABASE_SERVICE, opts);
  const tag = crypto.randomBytes(4).toString('hex');
  const who = {};
  const emails = {};
  const ids = [];
  for (const name of NAMES) {
    const email = `${name.toLowerCase()}-${tag}@rooms.test`;
    const password = crypto.randomBytes(12).toString('hex');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    ids.push(data.user.id);
    const client = createClient(url, process.env.ROOMS_SUPABASE_ANON, opts);
    const { error: e2 } = await client.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    emails[name.toLowerCase()] = email;
    who[name.toLowerCase()] = supabaseBackend(client);
  }
  return {
    ...who, emails,
    cleanup: async () => {
      await admin.from('rooms').delete().in('created_by', ids);
      await admin.from('teams').delete().in('created_by', ids);
      for (const id of ids) await admin.auth.admin.deleteUser(id);
    },
  };
}

const worlds = [['memory', memoryWorld]];
if (process.env.ROOMS_SUPABASE_URL && process.env.ROOMS_SUPABASE_SERVICE && process.env.ROOMS_SUPABASE_ANON) worlds.push(['supabase', liveWorld]);

const refused = async (p) => { await expect(p).rejects.toThrow(); };
const HOUR = 3_600_000;

describe.each(worlds)('rooms on %s', (_kind, make) => {
  let w;
  let team;
  let teamRoom;
  beforeAll(async () => {
    w = await make();
    for (const n of ['maya', 'theo', 'jun', 'ana']) await w[n].me();
    team = await w.maya.createTeam('Northwind');
    await w.maya.invite(team.id, w.emails.theo);
    await w.theo.acceptInvite(team.id);
  }, 60_000);
  afterAll(async () => { await w?.cleanup(); }, 60_000);

  it('a team has its room, named after it, and only its people are in it', async () => {
    const rooms = await w.maya.myRooms();
    teamRoom = rooms.find((r) => r.teamId === team.id);
    expect(teamRoom).toMatchObject({ name: 'Northwind', kind: 'room', role: 'owner', members: 2 });
    expect((await w.theo.myRooms()).map((r) => r.id)).toContain(teamRoom.id);
    expect((await w.theo.myRooms()).find((r) => r.id === teamRoom.id).role).toBe('member');
    expect(await w.jun.myRooms()).toEqual([]);
    expect(await w.jun.roomPeople(teamRoom.id)).toEqual([]);
    expect((await w.maya.roomPeople(teamRoom.id)).sort()).toEqual([w.maya.personId, w.theo.personId].sort());
  });

  it('a profile reaches the people I share a room with, and nobody else', async () => {
    await w.maya.saveRoomProfile({ display_name: 'Maya N.', show_working: 'team' });
    await w.theo.saveRoomProfile({ display_name: 'Theo N.' });
    await w.jun.saveRoomProfile({ display_name: 'Jun E.' });
    const ids = [w.maya.personId, w.theo.personId, w.jun.personId];
    expect((await w.theo.roomProfiles(ids)).map((p) => p.display_name).sort()).toEqual(['Maya N.', 'Theo N.']);
    expect((await w.jun.roomProfiles(ids)).map((p) => p.display_name)).toEqual(['Jun E.']);
    // A new card keeps thread names to its team (20261027000000_thread_names_stay_with_the_team.sql).
    expect(await w.jun.myRoomProfile()).toMatchObject({ display_name: 'Jun E.', show_working: 'team', show_agents: true });
  });

  it('a link shows the room before joining, and joining by it lets me see in', async () => {
    const token = await w.maya.roomLink(teamRoom.id);
    expect(await w.maya.roomLink(teamRoom.id)).toBe(token);
    expect(await w.theo.roomLink(teamRoom.id)).not.toBe(token);
    expect(await w.jun.roomPreview(token)).toMatchObject({ name: 'Northwind', members: 2, invitedBy: { name: 'Maya N.', avatar: null } });
    await w.maya.putPresence('aaaaaaaaaaaa', { agents_running: 3, hours_total: 120 });
    expect(await w.jun.roomMessages(teamRoom.id)).toEqual([]);
    expect(await w.jun.joinRoomByLink(token)).toBe(teamRoom.id);
    expect((await w.jun.roomPresence([w.maya.personId])).map((p) => p.agents_running)).toEqual([3]);
    expect((await w.jun.myRooms()).find((r) => r.id === teamRoom.id)).toMatchObject({ role: 'member', members: 3 });
  });

  it('a link turned off stops working; mine turns off mine, the owner’s turns off them all', async () => {
    const old = await w.maya.roomLink(teamRoom.id);
    const juns = await w.jun.roomLink(teamRoom.id);
    const junsNext = await w.jun.revokeRoomLink(teamRoom.id);
    expect(junsNext).not.toBe(juns);
    expect(await w.ana.roomPreview(juns)).toBeNull();
    expect(await w.ana.roomPreview(old)).toMatchObject({ name: 'Northwind' });
    const fresh = await w.maya.revokeRoomLink(teamRoom.id);
    expect(fresh).not.toBe(old);
    for (const dead of [old, junsNext]) await refused(w.ana.joinRoomByLink(dead));
    expect(await w.ana.roomPreview(old)).toBeNull();
  });

  it('presence: mine is always mine; someone invisible disappears from everyone else', async () => {
    await w.maya.saveRoomProfile({ invisible_until: new Date(Date.now() + HOUR).toISOString() });
    expect(await w.jun.roomProfiles([w.maya.personId])).toEqual([]);
    expect(await w.jun.roomPresence([w.maya.personId])).toEqual([]);
    expect(await w.maya.roomPresence([w.maya.personId])).toHaveLength(1);
    expect((await w.maya.myRoomProfile()).invisible_until).toBeTruthy();
    await w.maya.saveRoomProfile({ invisible_until: null });
    expect(await w.jun.roomProfiles([w.maya.personId])).toHaveLength(1);
  });

  it('a Mac gone away is not read by others', async () => {
    await w.maya.putPresence('bbbbbbbbbbbb', { agents_running: 1, gone: true });
    expect((await w.jun.roomPresence([w.maya.personId])).map((p) => p.device)).toEqual(['aaaaaaaaaaaa']);
  });

  it('chat: only the room reads it, mentions name only people in it, a reply stays in its room', async () => {
    const m = await w.jun.sendRoomMessage(teamRoom.id, { body: 'hi @Maya', mentions: [w.maya.personId, w.ana.personId] });
    expect(m).toMatchObject({ roomId: teamRoom.id, by: w.jun.personId, body: 'hi @Maya', mentions: [w.maya.personId] });
    const reply = await w.maya.sendRoomMessage(teamRoom.id, { body: 'hey', inReplyTo: m.id });
    expect(reply.inReplyTo).toBe(m.id);
    expect((await w.theo.roomMessages(teamRoom.id)).map((x) => x.body)).toEqual(['hi @Maya', 'hey']);
    expect(await w.ana.roomMessages(teamRoom.id)).toEqual([]);
    await refused(w.ana.sendRoomMessage(teamRoom.id, { body: 'let me in' }));
    await refused(w.maya.sendRoomMessage(teamRoom.id, { body: '   ' }));
    const group = await w.maya.createRoom({ name: 'Maya and Theo', kind: 'group', people: [w.theo.personId] });
    await refused(w.maya.sendRoomMessage(group, { body: 'x', inReplyTo: m.id }));
  });

  it('my mentions are read on their own, newest first, only from rooms I am in', async () => {
    const mine = await w.maya.roomMentions({ limit: 5 });
    expect(mine.map((m) => m.body)).toEqual(['hi @Maya']);
    expect(await w.ana.roomMentions()).toEqual([]);
  });

  it('reading moves forward only', async () => {
    const t = Date.now() - 1000;
    await w.theo.markRoomRead(teamRoom.id, t);
    await w.theo.markRoomRead(teamRoom.id, t - 60_000);
    const reads = await w.theo.roomReads();
    expect(Math.abs(reads.find((r) => r.roomId === teamRoom.id).readAt - t)).toBeLessThan(1000);
    await refused(w.ana.markRoomRead(teamRoom.id, t));
  });

  it('a message is edited and deleted only by who wrote it, and keeps its place', async () => {
    const m = await w.theo.sendRoomMessage(teamRoom.id, { body: 'draft' });
    expect(m).toMatchObject({ editedAt: null, deleted: false });
    await refused(w.maya.editRoomMessage(m.id, { body: 'not mine' }));
    await refused(w.ana.editRoomMessage(m.id, { body: 'not mine' }));
    await refused(w.theo.editRoomMessage(m.id, { body: '   ' }));
    const edited = await w.theo.editRoomMessage(m.id, { body: 'final @Maya @Ana', mentions: [w.maya.personId, w.ana.personId] });
    expect(edited).toMatchObject({ id: m.id, roomId: teamRoom.id, by: w.theo.personId, body: 'final @Maya @Ana', mentions: [w.maya.personId], deleted: false, at: m.at });
    expect(edited.editedAt).toBeGreaterThanOrEqual(m.at);
    expect((await w.maya.roomMessages(teamRoom.id)).find((x) => x.id === m.id)).toMatchObject({ body: 'final @Maya @Ana', editedAt: edited.editedAt });
    expect((await w.maya.roomMentions()).map((x) => x.id)).toContain(m.id);
    await refused(w.maya.deleteRoomMessage(m.id));
    await w.theo.deleteRoomMessage(m.id);
    expect((await w.maya.roomMessages(teamRoom.id)).find((x) => x.id === m.id)).toMatchObject({ id: m.id, by: w.theo.personId, body: '', mentions: [], deleted: true, at: m.at });
    expect((await w.maya.roomMentions()).map((x) => x.id)).not.toContain(m.id);
    await refused(w.theo.editRoomMessage(m.id, { body: 'back again' }));
  });

  it('reactions: only people in the room, one turned off stays as off, and a deleted message loses its own', async () => {
    const target = (await w.maya.roomMessages(teamRoom.id)).find((x) => x.body === 'hey');
    await w.jun.reactRoomMessage(target.id, '👍', true);
    await w.theo.reactRoomMessage(target.id, '👍', true);
    await refused(w.ana.reactRoomMessage(target.id, '👍', true));
    await refused(w.jun.reactRoomMessage(target.id, '', true));
    await refused(w.jun.reactRoomMessage(target.id, 'x'.repeat(17), true));
    await w.theo.reactRoomMessage(target.id, '👍', false);
    const got = (await w.maya.roomReactions(teamRoom.id)).filter((r) => r.messageId === target.id);
    expect(got.map((r) => [r.by, r.emoji, r.on]).sort()).toEqual([[w.jun.personId, '👍', true], [w.theo.personId, '👍', false]].sort());
    expect(got.every((r) => r.roomId === teamRoom.id && Number.isFinite(r.at))).toBe(true);
    expect(await w.ana.roomReactions(teamRoom.id)).toEqual([]);
    const doomed = await w.jun.sendRoomMessage(teamRoom.id, { body: 'to go' });
    await w.maya.reactRoomMessage(doomed.id, '🎉', true);
    await w.jun.deleteRoomMessage(doomed.id);
    expect((await w.maya.roomReactions(teamRoom.id)).filter((r) => r.messageId === doomed.id)).toEqual([]);
    await refused(w.maya.reactRoomMessage(doomed.id, '🎉', true));
  });

  // Postgres counts an emoji as one character; JavaScript's length counts two.
  it('counts a message in characters, so 4000 emoji fit and 4001 do not', async () => {
    const m = await w.theo.sendRoomMessage(teamRoom.id, { body: '😀'.repeat(4000) });
    await w.theo.editRoomMessage(m.id, { body: '🎉'.repeat(4000) });
    await refused(w.theo.editRoomMessage(m.id, { body: '🎉'.repeat(4001) }));
    await refused(w.theo.sendRoomMessage(teamRoom.id, { body: '😀'.repeat(4001) }));
  });

  it('files: only into a room I am in, under a plain name, once; deleting a message takes the files it names', async () => {
    await w.theo.putRoomFile(teamRoom.id, 'voice-1.webm', 'QUJD');
    expect(await w.maya.roomFile(teamRoom.id, 'voice-1.webm')).toBe('QUJD');
    expect(await w.ana.roomFile(teamRoom.id, 'voice-1.webm')).toBeNull();
    expect(await w.maya.roomFile(teamRoom.id, 'nothing.png')).toBeNull();
    await refused(w.ana.putRoomFile(teamRoom.id, 'in.png', 'QUJD'));
    await refused(w.theo.putRoomFile(teamRoom.id, '../x.png', 'QUJD'));
    await expect(w.theo.putRoomFile(teamRoom.id, 'voice-1.webm', 'WFla')).rejects.toMatchObject({ code: FILE_EXISTS });
    expect(await w.maya.roomFile(teamRoom.id, 'voice-1.webm')).toBe('QUJD');
    await w.theo.putRoomFile(teamRoom.id, 'kept.png', 'QUJD');
    const m = await w.theo.sendRoomMessage(teamRoom.id, { body: '[voice](attachments/voice-1.webm)' });
    await w.theo.deleteRoomMessage(m.id);
    expect(await w.maya.roomFile(teamRoom.id, 'voice-1.webm')).toBeNull();
    expect(await w.maya.roomFile(teamRoom.id, 'kept.png')).toBe('QUJD');
  });

  it('marking unread moves my read point back, and only mine', async () => {
    const t = Date.now() - 1000;
    const theirs = (await w.theo.roomReads()).find((r) => r.roomId === teamRoom.id).readAt;
    await w.maya.markRoomRead(teamRoom.id, t);
    await w.maya.markRoomUnread(teamRoom.id, t - 60_000);
    const mine = (await w.maya.roomReads()).find((r) => r.roomId === teamRoom.id).readAt;
    expect(Math.abs(mine - (t - 60_000))).toBeLessThan(1000);
    expect((await w.theo.roomReads()).find((r) => r.roomId === teamRoom.id).readAt).toBe(theirs);
    await refused(w.ana.markRoomUnread(teamRoom.id, t));
  });

  it('a room for only the people you invite has no link, and says so', async () => {
    const r = await w.maya.createRoom({ name: 'Board', inviteOnly: true });
    expect((await w.maya.myRooms()).find((x) => x.id === r)).toMatchObject({ inviteOnly: true, listed: false });
    await refused(w.maya.roomLink(r));
    await refused(w.maya.createRoom({ name: 'Both', listed: true, inviteOnly: true }));
    expect((await w.maya.myRooms()).find((x) => x.id === teamRoom.id).inviteOnly).toBe(false);
  });

  it('a group has no link, and is made only with people I share a room with', async () => {
    const group = (await w.maya.myRooms()).find((r) => r.kind === 'group');
    await refused(w.maya.roomLink(group.id));
    await refused(w.maya.createRoom({ name: 'Me and Ana', kind: 'group', people: [w.ana.personId] }));
  });

  it('a room for everyone needs a team in the alpha; General is listed and open', async () => {
    await refused(w.jun.createRoom({ name: 'Open', listed: true }));
    const open = await w.maya.createRoom({ name: 'Northwind open', listed: true });
    const listed = await w.ana.listedRooms();
    expect(listed.map((r) => r.id)).toEqual(expect.arrayContaining([open, GENERAL_ROOM]));
    expect(listed.find((r) => r.id === open)).toMatchObject({ name: 'Northwind open', members: 1, joined: false });
    expect(listed.find((r) => r.id === open).createdAt).toBeGreaterThanOrEqual(listed.find((r) => r.id === GENERAL_ROOM).createdAt);
    expect(await w.ana.joinListedRoom(open)).toBe(open);
    expect((await w.ana.listedRooms()).find((r) => r.id === open).joined).toBe(true);
    await refused(w.ana.joinListedRoom(teamRoom.id));
  });

  it('a room open to everyone gets a new owner when its owner leaves', async () => {
    const open = (await w.maya.myRooms()).find((r) => r.name === 'Northwind open');
    await w.maya.leaveRoom(open.id);
    expect((await w.ana.myRooms()).find((r) => r.id === open.id).role).toBe('owner');
    await w.maya.joinListedRoom(open.id);
  });

  it('an email invite waits for that email, and is used up by joining', async () => {
    const room = await w.jun.createRoom({ name: 'Jun’s room' });
    await w.jun.inviteToRoom(room, w.emails.ana.toUpperCase());
    await w.jun.inviteToRoom(room, w.emails.ana);
    expect(await w.theo.pendingRoomInvites()).toEqual([]);
    expect(await w.ana.pendingRoomInvites()).toEqual([expect.objectContaining({ roomId: room, roomName: 'Jun’s room', invitedBy: w.jun.personId, invitedByName: 'Jun E.' })]);
    await refused(w.theo.acceptRoomInvite(room));
    expect(await w.jun.roomInvitesSent(room)).toEqual([expect.objectContaining({ email: w.emails.ana, joined: false })]);
    expect(await w.theo.roomInvitesSent(room)).toEqual([]);
    expect(await w.ana.acceptRoomInvite(room)).toBe(room);
    expect(await w.ana.pendingRoomInvites()).toEqual([]);
    expect(await w.jun.roomInvitesSent(room)).toEqual([expect.objectContaining({ email: w.emails.ana, joined: true })]);
    expect(await w.ana.roomInvitesSent(room)).toEqual([]);
  });

  it('leaving: an owner hands the room on, the last one out ends it, a team room is left by leaving the team', async () => {
    const room = (await w.jun.myRooms()).find((r) => r.name === 'Jun’s room');
    await refused(w.ana.renameRoom(room.id, 'Ana’s now'));
    await w.jun.leaveRoom(room.id);
    expect((await w.ana.myRooms()).find((r) => r.id === room.id).role).toBe('owner');
    await w.ana.renameRoom(room.id, 'Ana’s now');
    await w.ana.leaveRoom(room.id);
    expect((await w.ana.myRooms()).map((r) => r.id)).not.toContain(room.id);
    await refused(w.maya.renameRoom(teamRoom.id, 'Renamed'));
  });

  it('only the owner removes someone, and someone removed reads nothing more', async () => {
    await refused(w.theo.removeRoomMember(teamRoom.id, w.jun.personId));
    await w.maya.removeRoomMember(teamRoom.id, w.jun.personId);
    expect(await w.jun.roomMessages(teamRoom.id)).toEqual([]);
    expect(await w.jun.roomProfiles([w.maya.personId])).toEqual([]);
  });

  it('my place on Agentbox counts everyone visible with more hours', async () => {
    await w.theo.putPresence('cccccccccccc', { hours_total: 500 });
    await w.jun.putPresence('dddddddddddd', { hours_total: 10 });
    const theo = (await w.theo.agentboxRanks([w.theo.personId]))[w.theo.personId];
    const jun = (await w.jun.agentboxRanks([w.jun.personId, w.theo.personId]));
    expect(jun[w.jun.personId]).toBeGreaterThan(theo);
    expect(Object.keys(jun)).toEqual([w.jun.personId]);
  });

  it('realtime: I hear messages in my rooms and not in others', async () => {
    const heard = [];
    let ready = false;
    const stop = w.ana.subscribeRooms((e) => { if (e.kind === 'subscribed') ready = true; if (e.kind === 'message') heard.push(e.message.body); });
    try {
      for (let i = 0; i < 100 && !ready; i += 1) await new Promise((r) => setTimeout(r, 100));
      expect(ready).toBe(true);
      const open = (await w.ana.myRooms()).find((r) => r.name === 'Northwind open');
      await w.maya.sendRoomMessage(open.id, { body: 'for the open room' });
      await w.maya.sendRoomMessage(teamRoom.id, { body: 'for the team only' });
      for (let i = 0; i < 100 && !heard.length; i += 1) await new Promise((r) => setTimeout(r, 100));
      expect(heard).toEqual(['for the open room']);
    } finally { stop(); }
  });

  it('realtime: an edit, a reaction and a delete in my rooms are heard, and none from elsewhere', async () => {
    const heard = [];
    let ready = false;
    const stop = w.ana.subscribeRooms((e) => {
      if (e.kind === 'subscribed') ready = true;
      if (e.kind === 'message') heard.push(['message', e.message.body, e.message.editedAt != null, e.message.deleted]);
      if (e.kind === 'reaction') heard.push(['reaction', e.reaction.messageId, e.reaction.emoji, e.reaction.on]);
    });
    try {
      for (let i = 0; i < 100 && !ready; i += 1) await new Promise((r) => setTimeout(r, 100));
      expect(ready).toBe(true);
      const open = (await w.ana.myRooms()).find((r) => r.name === 'Northwind open');
      const m = await w.maya.sendRoomMessage(open.id, { body: 'live' });
      const elsewhere = await w.maya.sendRoomMessage(teamRoom.id, { body: 'team only, live' });
      await w.maya.editRoomMessage(m.id, { body: 'live, edited' });
      await w.maya.reactRoomMessage(elsewhere.id, '👀', true);
      await w.maya.reactRoomMessage(m.id, '👀', true);
      // A delete takes the message's reactions with it, and Supabase checks who
      // may see a change by reading the row, so a reaction deleted a moment
      // after it was made is heard by nobody. Nothing is lost: its message is gone.
      for (let i = 0; i < 100 && !heard.some((h) => h[0] === 'reaction'); i += 1) await new Promise((r) => setTimeout(r, 100));
      await w.maya.deleteRoomMessage(m.id);
      for (let i = 0; i < 100 && heard.length < 4; i += 1) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 300));
      expect(heard).toEqual(expect.arrayContaining([
        ['message', 'live', false, false],
        ['message', 'live, edited', true, false],
        ['reaction', m.id, '👀', true],
        ['message', '', true, true],
      ]));
      expect(heard).toHaveLength(4);
    } finally { stop(); }
  });
});
