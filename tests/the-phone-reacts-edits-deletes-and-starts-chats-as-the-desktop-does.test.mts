// THE PHONE REACTS, EDITS, DELETES, SENDS FILES AND STARTS CHATS AS THE DESKTOP DOES.
//
// What was missing (2026-11-15, w-47416cec15): the phone's chats could only
// send and reply. renderer/src/phone-groups.ts answered every other chat
// action with "Do this in Agentbox on your computer", read no reactions at
// all, and could not start a chat. Measured against a stand-in REST client
// that records every call: each action goes through the same table or
// database function main/team/rooms-supabase.mts uses, and shows at once.
import { describe, it, expect } from 'vitest';
import { phoneGroups, NOT_ON_PHONE, ROOM_FILE_NAME } from '../renderer/src/phone-groups';
import { roomFileName } from '../mobile/src/lib/groups';

const ME = '00000000-0000-4000-8000-000000000001';
const SAM = '00000000-0000-4000-8000-000000000002';
const KAI = '00000000-0000-4000-8000-000000000003';
const OUT = '00000000-0000-4000-8000-000000000009';
const T0 = Date.parse('2026-11-15T15:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

type Row = Record<string, unknown>;
type Call = { kind: string; table?: string; name?: string; query?: string; row?: Row; args?: Row };

function standIn({ pair = false }: { pair?: boolean } = {}) {
  const calls: Call[] = [];
  const msg = (id: string, by: string, at: number, extra: Row = {}) => ({ id, room_id: 'r-1', by_person: by, body: `said ${id}`, in_reply_to: null, mentions: [], created_at: iso(at), edited_at: null, deleted_at: null, ...extra });
  const db: Record<string, Row[]> = {
    rooms: [
      { id: 'r-1', name: 'Northwind', kind: 'room', team_id: 't-1', listed: false, invite_only: false, role: 'member', members: 3, created_at: iso(T0 - 86_400_000) },
      ...(pair ? [{ id: 'r-pair', name: '', kind: 'group', team_id: null, listed: false, invite_only: false, role: 'member', members: 2, created_at: iso(T0 - 3_600_000) }] : []),
    ],
    room_messages: [msg('m1', SAM, T0 - 60_000), msg('m2', ME, T0 - 30_000)],
    room_reads: [],
    room_profiles: [],
    room_presence: [],
    team_members: [{ person_id: ME }, { person_id: SAM }, { person_id: KAI }],
    thread_cards: [],
    room_reactions: [
      { message_id: 'm1', room_id: 'r-1', person_id: SAM, emoji: '👍', is_on: true, updated_at: iso(T0 - 50_000) },
      { message_id: 'm1', room_id: 'r-1', person_id: KAI, emoji: '👍', is_on: true, updated_at: iso(T0 - 40_000) },
      { message_id: 'm1', room_id: 'r-1', person_id: KAI, emoji: '🎉', is_on: false, updated_at: iso(T0 - 35_000) },
    ],
  };
  const rpcs: Record<string, (a: Row) => unknown> = {
    my_rooms: () => db.rooms,
    room_people: (a) => (a.r === 'r-pair' ? [ME, SAM] : [ME, SAM, KAI]),
    room_names: () => null,
    create_room: () => 'r-new',
  };
  return {
    calls,
    db,
    session: () => ({ access_token: 'x', refresh_token: 'y', expires_at: T0 + 3_600_000, user: { id: ME, email: 'ada@example.com' } }),
    async select(table: string, query: string) {
      calls.push({ kind: 'select', table, query });
      const q = new URLSearchParams(query);
      let rows = [...(db[table] ?? [])];
      if (table === 'room_messages' && q.get('room_id')) rows = rows.filter((m) => `eq.${m.room_id}` === q.get('room_id'));
      return rows;
    },
    async insert(table: string, row: Row) {
      calls.push({ kind: 'insert', table, row });
      if (table === 'room_messages') {
        const made = { id: `m${db.room_messages.length + 1}`, created_at: iso(T0), edited_at: null, deleted_at: null, ...row };
        db.room_messages.push(made);
        return made;
      }
      return row;
    },
    async rpc(name: string, args: Row = {}) {
      calls.push({ kind: 'rpc', name, args });
      return rpcs[name]?.(args) ?? null;
    },
  };
}

const ready = async (pair = false) => {
  const c = standIn({ pair });
  const g = phoneGroups(c, { now: () => T0 });
  await g.refresh();
  c.calls.length = 0;
  return { c, g };
};
const message = (g: Awaited<ReturnType<typeof ready>>['g'], id: string) => g.state().messages['r-1'].find((m) => m.id === id)!;

describe('reactions', () => {
  it('are read from room_reactions and folded on, only those still on, oldest first', async () => {
    const { g } = await ready();
    expect(message(g, 'm1').reactions).toEqual({ '👍': [SAM, KAI] });
    expect(message(g, 'm2').reactions).toEqual({});
  });

  it('a reaction goes through react_room_message and shows at once', async () => {
    const { c, g } = await ready();
    const out = await g.door({ op: 'react', args: ['r-1', 'm2', '🎉', true] });
    expect(out.ok).toBe(true);
    expect(c.calls.find((x) => x.kind === 'rpc')).toEqual({ kind: 'rpc', name: 'react_room_message', args: { m: 'm2', p_emoji: '🎉', p_on: true } });
    expect(message(g, 'm2').reactions).toEqual({ '🎉': [ME] });
  });

  it('taking a reaction back leaves the others on it', async () => {
    const { g } = await ready();
    await g.door({ op: 'react', args: ['r-1', 'm1', '👍', true] });
    expect(message(g, 'm1').reactions?.['👍']).toEqual([SAM, KAI, ME]);
    await g.door({ op: 'react', args: ['r-1', 'm1', '👍', false] });
    expect(message(g, 'm1').reactions?.['👍']).toEqual([SAM, KAI]);
  });
});

describe('your own messages', () => {
  it('an edit goes through edit_room_message and shows the new words, marked edited', async () => {
    const { c, g } = await ready();
    const out = await g.door({ op: 'edit', args: ['r-1', 'm2', '  the new words  ', { mentions: [SAM] }] });
    expect(out.ok).toBe(true);
    expect(c.calls.find((x) => x.kind === 'rpc')).toEqual({ kind: 'rpc', name: 'edit_room_message', args: { m: 'm2', p_body: 'the new words', p_mentions: [SAM] } });
    expect(message(g, 'm2')).toMatchObject({ body: 'the new words', mentions: [SAM] });
    expect(message(g, 'm2').editedAt).toBe(T0);
  });

  it('an edit to nothing is refused before it is sent', async () => {
    const { c, g } = await ready();
    const out = await g.door({ op: 'edit', args: ['r-1', 'm2', '   '] });
    expect(out.ok).toBe(false);
    expect(c.calls.some((x) => x.kind === 'rpc')).toBe(false);
  });

  it('a delete goes through delete_room_message and leaves the message as deleted', async () => {
    const { c, g } = await ready();
    await g.door({ op: 'deleteMessage', args: ['r-1', 'm2'] });
    expect(c.calls.find((x) => x.kind === 'rpc')).toEqual({ kind: 'rpc', name: 'delete_room_message', args: { m: 'm2' } });
    expect(message(g, 'm2')).toMatchObject({ deleted: true, body: '' });
  });

  it('someone else’s message cannot be edited or deleted from the phone', async () => {
    const { c, g } = await ready();
    expect((await g.door({ op: 'edit', args: ['r-1', 'm1', 'mine now'] })).ok).toBe(false);
    expect((await g.door({ op: 'deleteMessage', args: ['r-1', 'm1'] })).ok).toBe(false);
    expect(c.calls.some((x) => x.kind === 'rpc')).toBe(false);
  });
});

describe('files', () => {
  it('a file goes into room_files as the person signed in', async () => {
    const { c, g } = await ready();
    const out = await g.door({ op: 'putFile', args: ['r-1', { name: 'photo-1.jpg', dataBase64: 'aGVsbG8=' }] });
    expect(out).toMatchObject({ ok: true, value: 'photo-1.jpg' });
    expect(c.calls.find((x) => x.kind === 'insert')).toEqual({ kind: 'insert', table: 'room_files', row: { room_id: 'r-1', name: 'photo-1.jpg', by_person: ME, data: 'aGVsbG8=' } });
  });

  it('a picked file is named so the chat can keep it, and two of the same name stay two', () => {
    expect(roomFileName('IMG 0001.HEIC', 1)).toBe('IMG-0001-1.heic');
    expect(roomFileName('.hidden', 2)).toBe('hidden-2');
    expect(roomFileName('été rapport.pdf', 3)).toBe('t-rapport-3.pdf');
    expect(ROOM_FILE_NAME.test(roomFileName('!!!.png', 4))).toBe(true);
    expect(roomFileName('a.png', 5)).not.toBe(roomFileName('a.png', 6));
  });

  it('a name the room cannot keep, or a file over 10 MB, is refused before it goes', async () => {
    const { c, g } = await ready();
    expect((await g.door({ op: 'putFile', args: ['r-1', { name: '../x.jpg', dataBase64: 'aGVsbG8=' }] })).ok).toBe(false);
    const big = 'A'.repeat(Math.ceil((10 * 1024 * 1024 + 3) / 3) * 4);
    expect((await g.door({ op: 'putFile', args: ['r-1', { name: 'big.mov', dataBase64: big }] })).ok).toBe(false);
    expect(c.calls.some((x) => x.kind === 'insert')).toBe(false);
  });
});

describe('starting a chat', () => {
  it('with one teammate, opens the two-person chat you already have', async () => {
    const { c, g } = await ready(true);
    const out = await g.door({ op: 'create', args: [{ name: '', kind: 'group', people: [ME, SAM] }] });
    expect(out).toMatchObject({ ok: true, value: 'r-pair' });
    expect(c.calls.some((x) => x.name === 'create_room')).toBe(false);
  });

  it('with one teammate and no chat yet, makes one through create_room', async () => {
    const { c, g } = await ready();
    const out = await g.door({ op: 'create', args: [{ name: '', kind: 'group', people: [ME, SAM] }] });
    expect(out).toMatchObject({ ok: true, value: 'r-new' });
    expect(c.calls.find((x) => x.name === 'create_room')?.args).toEqual({ p_name: '', p_kind: 'group', p_listed: false, p_people: [ME, SAM], p_invite_only: false });
  });

  it('a group of several teammates gets its name', async () => {
    const { c, g } = await ready();
    await g.door({ op: 'create', args: [{ people: [ME, SAM, KAI], name: ' Launch ' }] });
    expect(c.calls.find((x) => x.name === 'create_room')?.args).toMatchObject({ p_name: 'Launch', p_people: [ME, SAM, KAI] });
  });

  it('never with someone outside your team, or with nobody', async () => {
    const { c, g } = await ready();
    expect((await g.door({ op: 'create', args: [{ people: [ME, OUT] }] })).ok).toBe(false);
    expect((await g.door({ op: 'create', args: [{ people: [ME] }] })).ok).toBe(false);
    expect((await g.door({ op: 'create', args: [{ name: 'Open', kind: 'room', listed: true, people: [ME, SAM] }] })).ok).toBe(false);
    expect(c.calls.some((x) => x.name === 'create_room')).toBe(false);
  });
});

describe('what stays on the computer', () => {
  it('an action the phone does not have still says so', async () => {
    const { g } = await ready();
    expect(await g.door({ op: 'rename', args: ['r-1', 'x'] })).toMatchObject({ ok: false, error: NOT_ON_PHONE });
  });
});
