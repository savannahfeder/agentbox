// A ROOM CARD SAVES ON THE HOSTED CLOUD (w-3d0fa23ffb, 2026-10-21).
//
// The founder's first day on the real team cloud: every card read "Someone",
// nobody was on any wall, Settings had no Rooms page and nobody was ever seen
// present. Measured from a second account on that cloud, through the app's own
// backend: saving a card answered "permission denied for table room_profiles"
// and saving presence "permission denied for table room_presence", every time.
// The saves were upserts, and an upsert's update half rewrites the key columns
// (person_id, device), which the migration rightly does not let a person
// update. The local test cloud granted every column by default, so it passed
// there. A save is now an update of the columns that may change, and an
// insert when there was nothing to update.
//
// The stand-in client below refuses what the hosted cloud refuses: any upsert,
// and any update that names a key column.
import { describe, it, expect } from 'vitest';
import { roomsSupabase } from '../main/team/rooms-supabase.mjs';

const KEYS = { room_profiles: ['person_id'], room_presence: ['person_id', 'device'] };

function hostedCloud() {
  const tables = { room_profiles: [], room_presence: [] };
  const calls = [];
  const denied = (table) => ({ data: null, error: { code: '42501', message: `permission denied for table ${table}` } });
  const from = (table) => {
    const q = { op: 'select', filters: [], patch: null, row: null, single: false };
    const keyOf = (r) => KEYS[table].map((k) => r[k]).join('|');
    const run = () => {
      calls.push(`${q.op} ${table}`);
      const rows = tables[table];
      const match = (r) => q.filters.every(([k, v]) => r[k] === v);
      if (q.op === 'upsert') return denied(table);
      if (q.op === 'update') {
        if (Object.keys(q.patch).some((k) => KEYS[table].includes(k))) return denied(table);
        const hit = rows.filter(match);
        for (const r of hit) Object.assign(r, q.patch);
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      if (q.op === 'insert') {
        if (rows.some((r) => keyOf(r) === keyOf(q.row))) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        rows.push({ ...q.row });
        return { data: [{ ...q.row }], error: null };
      }
      return { data: rows.filter(match).map((r) => ({ ...r })), error: null };
    };
    const b = {
      select: () => b, limit: () => b, in: () => b,
      eq: (k, v) => { q.filters.push([k, v]); return b; },
      update: (patch) => { q.op = 'update'; q.patch = patch; return b; },
      insert: (row) => { q.op = 'insert'; q.row = row; return b; },
      upsert: (row) => { q.op = 'upsert'; q.row = row; return b; },
      then: (ok, bad) => Promise.resolve(run()).then(ok, bad),
    };
    return b;
  };
  return { client: { from, rpc: async () => ({ data: [], error: null }) }, tables, calls };
}

const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };
const backendFor = (cloud, me = 'p-me') => roomsSupabase(cloud.client, async () => me, must);

describe('my room card', () => {
  it('is made the first time, with no upsert', async () => {
    const cloud = hostedCloud();
    const saved = await backendFor(cloud).saveRoomProfile({ display_name: 'Maya C.', avatar_url: null });
    expect(saved).toMatchObject({ person_id: 'p-me', display_name: 'Maya C.' });
    expect(cloud.tables.room_profiles).toHaveLength(1);
    expect(cloud.calls).not.toContain('upsert room_profiles');
  });
  it('is changed after that, in place', async () => {
    const cloud = hostedCloud();
    const b = backendFor(cloud);
    await b.saveRoomProfile({ display_name: 'Maya C.' });
    const saved = await b.saveRoomProfile({ show_working: 'none' });
    expect(saved).toMatchObject({ display_name: 'Maya C.', show_working: 'none' });
    expect(cloud.tables.room_profiles).toHaveLength(1);
  });
  it('made by another Mac at the same moment, is changed rather than lost', async () => {
    const cloud = hostedCloud();
    const b = backendFor(cloud);
    // The other Mac's insert lands between this one's update and insert.
    const from = cloud.client.from;
    let raced = false;
    cloud.client.from = (t) => {
      const q = from(t);
      const insert = q.insert;
      q.insert = (row) => { if (!raced) { raced = true; cloud.tables.room_profiles.push({ person_id: 'p-me', display_name: 'Other Mac' }); } return insert(row); };
      return q;
    };
    const saved = await b.saveRoomProfile({ display_name: 'Maya C.' });
    expect(saved).toMatchObject({ display_name: 'Maya C.' });
    expect(cloud.tables.room_profiles).toHaveLength(1);
  });
});

describe('my presence', () => {
  it('is one row per Mac, made once and then changed in place', async () => {
    const cloud = hostedCloud();
    const b = backendFor(cloud);
    await b.putPresence('aaaaaaaaaaaa', { agents_running: 2, gone: false });
    await b.putPresence('aaaaaaaaaaaa', { agents_running: 3, gone: false });
    await b.putPresence('bbbbbbbbbbbb', { agents_running: 1, gone: false });
    expect(cloud.tables.room_presence.map((r) => [r.device, r.agents_running])).toEqual([['aaaaaaaaaaaa', 3], ['bbbbbbbbbbbb', 1]]);
    expect(cloud.calls).not.toContain('upsert room_presence');
  });
  it('another person’s row is never touched', async () => {
    const cloud = hostedCloud();
    cloud.tables.room_presence.push({ person_id: 'p-other', device: 'aaaaaaaaaaaa', agents_running: 9 });
    await backendFor(cloud).putPresence('aaaaaaaaaaaa', { agents_running: 1 });
    expect(cloud.tables.room_presence.find((r) => r.person_id === 'p-other').agents_running).toBe(9);
  });
});
