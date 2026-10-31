// THE PHONE READS AND WRITES GROUPS AS THE PERSON SIGNED IN.
//
// What was missing (2026-10-28, w-9f9c2570e2): Groups lived only on the Mac.
// main/team/rooms-supabase.mjs reads and posts through supabase-js, which
// neither phone app carries, so the web app and the iPhone app had no group
// list, no chat and no People. renderer/src/phone-groups.ts is the same
// queries over the phones' plain REST client (cloud-rest.ts), measured here
// against a stand-in client that records every request: which table or
// function each read asks, that a message goes out as the person signed in,
// that read marks go through mark_room_read, and that nothing the phone does
// writes presence, a profile or a membership (a phone runs no agents).
import { describe, it, expect } from 'vitest';
import {
  GROUP_COLS, groupMessages, groupPeople, groupsState, markGroupRead, myGroups, phoneGroups, sendToGroup,
} from '../renderer/src/phone-groups';
import { MSG_COLS, PROFILE_COLS, PRESENCE_COLS, OLD_PRESENCE_COLS } from '../main/team/rooms-shape.mjs';

const ME = '00000000-0000-4000-8000-000000000001';
const SAM = '00000000-0000-4000-8000-000000000002';
const KAI = '00000000-0000-4000-8000-000000000003';
const T0 = Date.parse('2026-10-28T15:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

const msg = (id, by, at, extra = {}) => ({ id, room_id: 'r-1', by_person: by, body: `said ${id}`, in_reply_to: null, mentions: [], created_at: iso(at), edited_at: null, deleted_at: null, ...extra });

/** A REST client that answers from tables and remembers every call. */
function standIn({ signedIn = true, old = false } = {}) {
  const calls = [];
  const db = {
    rooms: [{ id: 'r-1', name: 'Northwind', kind: 'room', team_id: 't-1', listed: false, invite_only: false, role: 'member', members: 3, created_at: iso(T0 - 86_400_000) }],
    room_messages: [msg('m1', SAM, T0 - 60_000), msg('m2', KAI, T0 - 30_000, { mentions: [ME] }), msg('m3', ME, T0 - 20_000), msg('m4', SAM, T0 - 10_000, { in_reply_to: 'm1' })],
    room_reads: [{ room_id: 'r-1', read_at: iso(T0 - 45_000) }],
    room_profiles: [
      { person_id: ME, display_name: 'Ada L.', show_working: 'team', show_agents: true, show_level: true },
      { person_id: SAM, display_name: 'Sam R.', show_working: 'everyone', show_agents: true, show_level: true },
      { person_id: KAI, display_name: 'Kai I.', show_working: 'team', show_agents: true, show_level: true },
    ],
    room_presence: [
      { person_id: SAM, device: 'aaaaaaaaaaaa', agents_running: 2, working_on: 'Draw the sign-in screen', working_private: false, working_at: iso(T0 - 60_000), hours_total: 100, updated_at: iso(T0 - 60_000) },
      { person_id: KAI, device: 'bbbbbbbbbbbb', agents_running: 1, working_on: null, working_private: false, working_at: iso(T0 - 60_000), hours_total: 12, updated_at: iso(T0 - 60_000) },
    ],
    team_members: [{ person_id: ME }, { person_id: KAI }],
    thread_cards: [{ person_id: KAI, title: 'Fix the login meter', state: 'running', visible: true, updated_at: iso(T0 - 50_000) }],
  };
  const rpcs = {
    my_rooms: () => db.rooms,
    room_people: () => [ME, SAM, KAI],
    room_names: () => [ME, SAM, KAI].map((id) => ({ person_id: id, name: db.room_profiles.find((p) => p.person_id === id).display_name, avatar_url: null, has_card: true })),
    mark_room_read: () => null,
  };
  const notThere = (what) => Object.assign(new Error(`column ${what} does not exist`), { status: 400 });
  return {
    calls,
    db,
    session: () => (signedIn ? { access_token: 'x', refresh_token: 'y', expires_at: T0 + 3_600_000, user: { id: ME, email: 'ada@example.com' } } : null),
    async select(table, query) {
      calls.push({ kind: 'select', table, query });
      const q = new URLSearchParams(query);
      if (old && table === 'room_messages' && /edited_at/.test(q.get('select'))) throw notThere('room_messages.edited_at');
      if (table === 'room_messages') {
        let rows = [...db.room_messages];
        if (q.get('room_id')) rows = rows.filter((m) => `eq.${m.room_id}` === q.get('room_id'));
        if (q.get('mentions')) rows = rows.filter((m) => m.mentions.includes(ME));
        if (q.get('created_at')?.startsWith('gt.')) rows = rows.filter((m) => Date.parse(m.created_at) > Date.parse(q.get('created_at').slice(3)));
        if (q.get('created_at')?.startsWith('lt.')) rows = rows.filter((m) => Date.parse(m.created_at) < Date.parse(q.get('created_at').slice(3)));
        rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        return rows.slice(0, Number(q.get('limit') ?? 1000));
      }
      return db[table] ?? [];
    },
    async insert(table, row) {
      calls.push({ kind: 'insert', table, row });
      if (table === 'room_messages') {
        const made = { id: `m${db.room_messages.length + 1}`, created_at: iso(T0), edited_at: null, deleted_at: null, ...row };
        db.room_messages.push(made);
        return made;
      }
      return row;
    },
    async rpc(name, args = {}) {
      calls.push({ kind: 'rpc', name, args });
      return rpcs[name]?.(args) ?? null;
    },
  };
}

describe('the phone asks the cloud what the Mac asks it', () => {
  it('reads the columns the Mac reads', () => {
    expect(GROUP_COLS.message).toBe(MSG_COLS);
    expect(GROUP_COLS.profile).toBe(PROFILE_COLS);
    expect(GROUP_COLS.presence).toBe(PRESENCE_COLS);
    expect(GROUP_COLS.oldPresence).toBe(OLD_PRESENCE_COLS);
  });

  it('lists my groups through my_rooms, in the Mac’s shape', async () => {
    const c = standIn();
    const rooms = await myGroups(c);
    expect(c.calls).toEqual([{ kind: 'rpc', name: 'my_rooms', args: {} }]);
    expect(rooms[0]).toMatchObject({ id: 'r-1', name: 'Northwind', kind: 'room', teamId: 't-1', members: 3 });
  });

  it('reads a group’s newest 200 messages and hands them back oldest first', async () => {
    const c = standIn();
    const got = await groupMessages(c, 'r-1');
    const q = new URLSearchParams(c.calls[0].query);
    expect(c.calls[0].table).toBe('room_messages');
    expect(q.get('select')).toBe(MSG_COLS);
    expect(q.get('room_id')).toBe('eq.r-1');
    expect(q.get('order')).toBe('created_at.desc');
    expect(q.get('limit')).toBe('200');
    expect(got.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(got[3]).toMatchObject({ by: SAM, inReplyTo: 'm1', roomId: 'r-1' });
  });

  it('reads only what came after the newest message held, and what came before the oldest', async () => {
    const c = standIn();
    const after = await groupMessages(c, 'r-1', { after: T0 - 25_000 });
    expect(after.map((m) => m.id)).toEqual(['m3', 'm4']);
    const before = await groupMessages(c, 'r-1', { before: T0 - 25_000, limit: 100 });
    expect(before.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(new URLSearchParams(c.calls[1].query).get('limit')).toBe('100');
  });

  it('on a cloud from before edits and deletes, reads the columns it has instead of failing', async () => {
    const c = standIn({ old: true });
    const got = await groupMessages(c, 'r-1');
    expect(got).toHaveLength(4);
    expect(new URLSearchParams(c.calls.at(-1).query).get('select')).not.toMatch(/edited_at/);
  });
});

describe('what the phone writes, and as whom', () => {
  it('a message goes out as the person signed in, with its reply and mentions', async () => {
    const c = standIn();
    const m = await sendToGroup(c, 'r-1', { body: '  on it  ', inReplyTo: 'm2', mentions: [KAI] });
    expect(c.calls[0]).toEqual({ kind: 'insert', table: 'room_messages', row: { room_id: 'r-1', by_person: ME, body: 'on it', in_reply_to: 'm2', mentions: [KAI] } });
    expect(m).toMatchObject({ by: ME, body: 'on it', inReplyTo: 'm2' });
  });

  it('an empty message is not sent', async () => {
    const c = standIn();
    await expect(sendToGroup(c, 'r-1', { body: '   ' })).rejects.toThrow();
    expect(c.calls).toEqual([]);
  });

  it('marking read goes through mark_room_read, which never moves a read point back', async () => {
    const c = standIn();
    await markGroupRead(c, 'r-1', T0);
    expect(c.calls).toEqual([{ kind: 'rpc', name: 'mark_room_read', args: { r: 'r-1', at: iso(T0) } }]);
  });

  it('signed out, nothing is asked or written', async () => {
    const c = standIn({ signedIn: false });
    await expect(sendToGroup(c, 'r-1', { body: 'hi' })).rejects.toThrow(/not signed in/);
    await expect(myGroups(c)).rejects.toThrow(/not signed in/);
    expect(c.calls).toEqual([]);
  });

  it('a whole read and a send never write presence, a profile or a membership', async () => {
    const c = standIn();
    const g = phoneGroups(c, { now: () => T0 });
    await g.refresh();
    await g.send('r-1', 'hello', { inReplyTo: null, mentions: [] });
    await g.markRead('r-1');
    const writes = c.calls.filter((x) => x.kind === 'insert');
    expect(writes.map((w) => w.table)).toEqual(['room_messages']);
    expect(c.calls.filter((x) => x.kind === 'rpc').map((x) => x.name)).not.toEqual(expect.arrayContaining(['create_room', 'join_listed_room']));
    expect(c.calls.some((x) => /room_presence|room_profiles|room_members/.test(x.table ?? '') && x.kind !== 'select')).toBe(false);
  });
});

describe('a group’s people, and the list with what is unread', () => {
  it('names everyone, with their level, what they are on and their agents', async () => {
    const c = standIn();
    const got = await groupPeople(c, ['r-1']);
    expect(c.calls.filter((x) => x.kind === 'rpc').map((x) => x.name).sort()).toEqual(['room_names', 'room_people']);
    const profiles = c.calls.find((x) => x.table === 'room_profiles');
    expect(new URLSearchParams(profiles.query).get('person_id')).toBe(`in.(${ME},${SAM},${KAI})`);
    const state = groupsState({ rooms: await myGroups(c), ...got, messages: new Map(), reads: new Map(), mentioned: [], meId: ME, now: T0 });
    const wall = state.rooms[0].wall;
    const sam = wall.find((p) => p.id === SAM);
    const kai = wall.find((p) => p.id === KAI);
    expect(sam).toMatchObject({ name: 'Sam R.', agents: 2, workingOn: 'Draw the sign-in screen', teammate: false });
    expect(sam.level).toBeGreaterThan(1);
    // A teammate who shows their work to the team only: named from the team's thread cards.
    expect(kai).toMatchObject({ agents: 1, workingOn: 'Fix the login meter', teammate: true });
    expect(wall.find((p) => p.id === ME)).toMatchObject({ me: true });
  });

  it('counts what others wrote after my read point, never my own or a deleted one', async () => {
    const c = standIn();
    c.db.room_messages.push(msg('m5', KAI, T0 - 5_000, { deleted_at: iso(T0 - 1_000), body: '' }));
    const g = phoneGroups(c, { now: () => T0 });
    const state = await g.refresh();
    const room = state.rooms[0];
    // m2 and m4 are after the read point (T0-45s) and someone else's; m3 is mine, m5 is gone.
    expect(room.unread).toBe(2);
    expect(state.messages['r-1'].map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(state.mentions.map((m) => m.messageId)).toEqual(['m2']);
    expect(state).toMatchObject({ on: true, ready: true, error: null });
  });

  it('reading the group up to its newest message clears it, and says so to the cloud once', async () => {
    const c = standIn();
    const g = phoneGroups(c, { now: () => T0 });
    await g.refresh();
    await g.markRead('r-1');
    expect(g.state().rooms[0].unread).toBe(0);
    await g.markRead('r-1');
    expect(c.calls.filter((x) => x.name === 'mark_room_read')).toEqual([{ kind: 'rpc', name: 'mark_room_read', args: { r: 'r-1', at: iso(T0 - 10_000) } }]);
  });

  it('a message sent shows at once and does not count as unread', async () => {
    const c = standIn();
    const g = phoneGroups(c, { now: () => T0 });
    await g.refresh();
    await g.markRead('r-1');
    await g.send('r-1', 'done', { inReplyTo: null, mentions: [] });
    expect(g.state().messages['r-1'].at(-1)).toMatchObject({ body: 'done', by: ME });
    expect(g.state().rooms[0].unread).toBe(0);
  });

  it('a later read asks only for what is newer than what it holds', async () => {
    const c = standIn();
    const g = phoneGroups(c, { now: () => T0 });
    await g.refresh();
    c.calls.length = 0;
    await g.refresh();
    const reads = c.calls.filter((x) => x.table === 'room_messages' && !new URLSearchParams(x.query).get('mentions'));
    expect(reads).toHaveLength(1);
    expect(new URLSearchParams(reads[0].query).get('created_at')).toBe(`gt.${iso(T0 - 10_000)}`);
  });
});
