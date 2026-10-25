// PRESENCE AND NAMES KEEP WORKING ON A CLOUD NOT YET UPDATED (w-3d0fa23ffb, 2026-10-22).
//
// 20261022000100_rooms_show_everyone.sql adds room_presence.activity and the
// room_names function, and a person runs it by hand, so the app can reach a
// cloud before it does. Asking that cloud for a column it lacks fails the whole
// call, and a presence save that fails is a person nobody sees working. Against
// a stand-in that answers the way PostgREST does: presence still saves and
// reads, without activity, and names answer null so the wall and chat keep to
// the cards. On an updated cloud activity is sent and names are read.
import { describe, it, expect, vi } from 'vitest';
import { roomsSupabase } from '../main/team/rooms-supabase.mjs';

function cloud(state) {
  const writes = [];
  const reads = [];
  const missing = { code: 'PGRST204', message: "Could not find the 'activity' column of 'room_presence' in the schema cache" };
  const query = (table) => {
    const q = { op: 'select', fields: null, cols: '' };
    const chain = {
      select(cols) { if (q.op === 'select') q.cols = cols ?? ''; else q.cols = cols ?? q.cols; return chain; },
      update(fields) { q.op = 'update'; q.fields = fields; return chain; },
      insert(fields) { q.op = 'insert'; q.fields = fields; return chain; },
      eq() { return chain; }, in() { return chain; },
      then(ok, bad) {
        let res;
        const asksActivity = (q.fields && 'activity' in q.fields) || /activity/.test(q.cols);
        if (!state.updated && asksActivity) res = { data: null, error: missing };
        else if (q.op === 'select') { reads.push({ table, cols: q.cols }); res = { data: [{ person_id: 'p2', device: 'aaaaaaaaaaaa', agents_running: 1, ...(state.updated ? { activity: [] } : {}) }], error: null }; }
        else { writes.push({ table, op: q.op, fields: q.fields }); res = { data: [{ person_id: 'p1' }], error: null }; }
        return Promise.resolve(res).then(ok, bad);
      },
    };
    return chain;
  };
  const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };
  const rpc = async (fn) => (fn === 'room_names' && !state.updated
    ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.room_names(r) in the schema cache' } }
    : { data: fn === 'room_names' ? [{ person_id: 'p2', name: 'Maya C.', avatar_url: null, has_card: true }] : [], error: null });
  return { writes, reads, backend: roomsSupabase({ from: query, rpc }, async () => 'p1', must) };
}

const row = { gone: false, agents_running: 1, working_on: null, activity: [{ title: 'Ship it', project: null, state: 'running', at: 1 }] };

describe('a cloud not yet updated', () => {
  it('saves presence without activity, and keeps saving that way', async () => {
    const { backend, writes } = cloud({ updated: false });
    await backend.putPresence('aaaaaaaaaaaa', row);
    await backend.putPresence('aaaaaaaaaaaa', row);
    expect(writes).toHaveLength(2);
    expect(writes.every((w) => !('activity' in w.fields) && w.fields.agents_running === 1)).toBe(true);
  });

  it('reads presence on the columns it has', async () => {
    const { backend, reads } = cloud({ updated: false });
    const got = await backend.roomPresence(['p2']);
    expect(got).toEqual([{ person_id: 'p2', device: 'aaaaaaaaaaaa', agents_running: 1 }]);
    expect(reads.at(-1).cols).not.toMatch(/activity/);
  });

  it('answers names with null, which the wall and chat read as "use the cards"', async () => {
    const { backend } = cloud({ updated: false });
    await expect(backend.roomNames('r1')).resolves.toBeNull();
  });
});

describe('a cloud updated while the app is open', () => {
  it('is asked again a minute later, and from then on is sent the activity', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-22T10:00:00Z'), toFake: ['Date'] });
    try {
      const state = { updated: false };
      const { backend, writes } = cloud(state);
      await backend.putPresence('aaaaaaaaaaaa', row);
      state.updated = true;
      await backend.putPresence('aaaaaaaaaaaa', row);
      expect('activity' in writes.at(-1).fields).toBe(false);
      vi.setSystemTime(Date.parse('2026-10-22T10:01:01Z'));
      await backend.putPresence('aaaaaaaaaaaa', row);
      expect(writes.at(-1).fields.activity).toEqual(row.activity);
    } finally { vi.useRealTimers(); }
  });
});

describe('an updated cloud', () => {
  it('is sent the activity and asked for it', async () => {
    const { backend, writes, reads } = cloud({ updated: true });
    await backend.putPresence('aaaaaaaaaaaa', row);
    expect(writes[0].fields.activity).toEqual(row.activity);
    await backend.roomPresence(['p2']);
    expect(reads.at(-1).cols).toMatch(/activity/);
  });

  it('names everyone in the room', async () => {
    const { backend } = cloud({ updated: true });
    await expect(backend.roomNames('r1')).resolves.toEqual([{ person_id: 'p2', name: 'Maya C.', avatar_url: null, has_card: true }]);
  });

  it('a save that fails for another reason still says so', async () => {
    const { backend } = cloud({ updated: true });
    const broken = roomsSupabase({ from: () => ({ update() { return this; }, eq() { return this; }, select() { return this; }, then: (ok) => Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied for table room_presence' } }).then(ok) }), rpc: async () => ({ data: [], error: null }) }, async () => 'p1', (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; });
    await expect(broken.putPresence('aaaaaaaaaaaa', row)).rejects.toThrow(/permission denied/);
    expect(backend).toBeTruthy();
  });
});
