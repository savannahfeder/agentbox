// ROOM CHAT KEEPS WORKING ON A CLOUD THAT HAS NOT BEEN UPDATED YET.
//
// Edits, deletes and reactions in rooms need new columns and tables in the
// team cloud (20261022000000_room_messages_do_more.sql), and a person applies
// that by hand. The app asked for the new columns on every read, so an app
// updated before its cloud read no room chat at all. Measured here against a
// stand-in cloud that answers the way Postgres does for a column or table it
// does not have: messages and mentions still read, on the old columns, sending
// still works, and reactions read as none rather than as an error. And the
// case that must not change: on an updated cloud the new columns are asked for.
import { describe, it, expect } from 'vitest';
import { roomsSupabase } from '../main/team/rooms-supabase.mjs';

const NEW = ['edited_at', 'deleted_at'];
const row = { id: 'm1', room_id: 'r1', by_person: 'p1', body: 'hi', in_reply_to: null, mentions: [], created_at: '2026-10-21T10:00:00Z' };

function cloud({ updated }) {
  const asked = [];
  const answer = (cols, filters) => {
    if (!updated && (NEW.some((c) => cols.includes(c)) || filters.some((f) => NEW.some((c) => f.includes(c))))) {
      return { data: null, error: { code: '42703', message: 'column room_messages.edited_at does not exist' } };
    }
    return { data: [{ ...row, ...(updated ? { edited_at: null, deleted_at: null } : {}) }], error: null };
  };
  const query = (table) => {
    const q = { cols: '', filters: [], single: false };
    const chain = {
      select(cols) { q.cols = cols; asked.push({ table, cols }); return chain; },
      insert() { return chain; },
      eq() { return chain; }, lt() { return chain; }, order() { return chain; }, limit() { return chain; },
      contains() { return chain; },
      is(col) { q.filters.push(col); return chain; },
      single() { q.single = true; return chain; },
      then(ok, bad) {
        let res;
        if (table === 'room_reactions' && !updated) res = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.room_reactions'" } };
        else if (table === 'room_reactions') res = { data: [], error: null };
        else res = answer(q.cols, q.filters);
        if (q.single && res.data) res = { ...res, data: res.data[0] };
        return Promise.resolve(res).then(ok, bad);
      },
    };
    return chain;
  };
  const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };
  const rpc = async (fn) => (!updated && fn !== 'mark_room_read'
    ? { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } }
    : { data: null, error: null });
  return { asked, backend: roomsSupabase({ from: query, rpc }, async () => 'p1', must) };
}

describe('a cloud not yet updated', () => {
  it('still reads the chat, on the old columns', async () => {
    const { backend } = cloud({ updated: false });
    const got = await backend.roomMessages('r1');
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ id: 'm1', body: 'hi', deleted: false, editedAt: null });
  });

  it('still reads your mentions and still sends', async () => {
    const { backend } = cloud({ updated: false });
    await expect(backend.roomMentions()).resolves.toHaveLength(1);
    await expect(backend.sendRoomMessage('r1', { body: 'hi' })).resolves.toMatchObject({ id: 'm1' });
  });

  it('reads no reactions rather than failing', async () => {
    const { backend } = cloud({ updated: false });
    await expect(backend.roomReactions('r1')).resolves.toEqual([]);
  });

  it('says in plain words that an edit or a reaction needs the update', async () => {
    const { backend } = cloud({ updated: false });
    await expect(backend.reactRoomMessage('m1', '👍', true)).rejects.toThrow(/needs its latest update/);
    await expect(backend.editRoomMessage('m1', { body: 'x' })).rejects.toThrow(/needs its latest update/);
    await expect(backend.markRoomRead('r1', 1)).resolves.toBeUndefined();
  });
});

describe('an updated cloud', () => {
  it('is asked for the new columns', async () => {
    const { backend, asked } = cloud({ updated: true });
    await backend.roomMessages('r1');
    expect(asked.at(-1).cols).toContain('edited_at');
    expect(asked.at(-1).cols).toContain('deleted_at');
  });
});
