// A CLOUD UPDATED WHILE THE APP IS OPEN IS NOTICED.
//
// A room voice note would not send: the team cloud had every update but the
// one for rooms (supabase migration list showed 20261022000000 with no remote
// side), so the app said the cloud needed its update. Applying it should have
// been enough, but the app, once it had seen the old cloud, read the old way
// until it was restarted: reactions read as none and edits never showed.
// Measured against a stand-in cloud that is updated mid-session: within a
// minute the new columns are asked for again and reactions read, and anything
// only an updated cloud can do that succeeds settles it at once, even against
// a late answer to a read asked before the update (Codex found that race).
// The case that must not change: a cloud still old is not asked again before
// the minute.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { roomsSupabase } from '../main/team/rooms-supabase.mjs';

const NEW = ['edited_at', 'deleted_at'];
const row = { id: 'm1', room_id: 'r1', by_person: 'p1', body: 'hi', in_reply_to: null, mentions: [], created_at: '2026-10-21T10:00:00Z' };

function cloud() {
  // `hold`: the next question is answered as the cloud was when asked, once it resolves.
  const state = { updated: false, asked: [], hold: null };
  const query = (table) => {
    const q = { cols: '', single: false, was: state.updated, wait: null };
    const chain = {
      select(cols) { q.cols = cols; q.was = state.updated; q.wait = state.hold; state.hold = null; state.asked.push({ table, cols }); return chain; },
      insert() { return chain; },
      eq() { return chain; }, lt() { return chain; }, order() { return chain; }, limit() { return chain; },
      contains() { return chain; }, is() { return chain; },
      single() { q.single = true; return chain; },
      then(ok, bad) {
        const updated = table === 'room_files' ? state.updated : q.was;
        let res;
        if (table === 'room_reactions') res = updated ? { data: [{ message_id: 'm1', person_id: 'p2', emoji: '👍', is_on: true, updated_at: row.created_at }], error: null } : { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.room_reactions'" } };
        else if (table === 'room_files' && updated && state.fileThere) res = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        else if (table === 'room_files') res = updated ? { data: null, error: null } : { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.room_files'" } };
        else if (!updated && NEW.some((c) => q.cols.includes(c))) res = { data: null, error: { code: '42703', message: 'column room_messages.edited_at does not exist' } };
        else res = { data: [{ ...row, ...(updated ? { edited_at: null, deleted_at: null } : {}) }], error: null };
        if (q.single && res.data) res = { ...res, data: res.data[0] };
        return Promise.resolve(q.wait).then(() => res).then(ok, bad);
      },
    };
    return chain;
  };
  const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };
  const rpc = async () => ({ data: null, error: null });
  return { state, backend: roomsSupabase({ from: query, rpc }, async () => 'p1', must) };
}
const lastMessageRead = (asked) => asked.filter((a) => a.table === 'room_messages').at(-1).cols;

afterEach(() => { vi.useRealTimers(); });

describe('a cloud updated while the app is open', () => {
  it('is read the new way within a minute, without a restart', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { state, backend } = cloud();
    await backend.roomMessages('r1');
    expect(lastMessageRead(state.asked)).not.toContain('edited_at');
    state.updated = true;
    vi.advanceTimersByTime(61_000);
    await backend.roomMessages('r1');
    expect(lastMessageRead(state.asked)).toContain('edited_at');
    await expect(backend.roomReactions('r1')).resolves.toHaveLength(1);
  });

  it('is read the new way at once after a retried voice note finds it already there', async () => {
    const { state, backend } = cloud();
    await backend.roomMessages('r1');
    state.updated = true;
    state.fileThere = true;
    await expect(backend.putRoomFile('r1', 'voice-note-4000ms.webm', 'AAAA')).rejects.toThrow();
    await backend.roomMessages('r1');
    expect(lastMessageRead(state.asked)).toContain('edited_at');
  });

  it('is read the new way at once after a voice note reaches it', async () => {
    const { state, backend } = cloud();
    await backend.roomMessages('r1');
    state.updated = true;
    await backend.putRoomFile('r1', 'voice-note-4000ms.webm', 'AAAA');
    await backend.roomMessages('r1');
    expect(lastMessageRead(state.asked)).toContain('edited_at');
  });
});

describe('two reads crossing as the cloud is updated', () => {
  it('does not let a late answer from before the update mark it old again', async () => {
    const { state, backend } = cloud();
    let release;
    state.hold = new Promise((r) => { release = r; });
    const late = backend.roomMessages('r1');
    await new Promise((r) => setTimeout(r, 0));
    expect(state.asked).toHaveLength(1);
    state.updated = true;
    await backend.roomMessages('r1');
    release();
    await late;
    await backend.roomMessages('r1');
    expect(lastMessageRead(state.asked)).toContain('edited_at');
    await expect(backend.roomReactions('r1')).resolves.toHaveLength(1);
  });
});

describe('a cloud still old', () => {
  it('is not asked for the new columns again before the minute is up', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { state, backend } = cloud();
    await backend.roomMessages('r1');
    const before = state.asked.length;
    vi.advanceTimersByTime(30_000);
    await backend.roomMessages('r1');
    expect(state.asked.slice(before).map((a) => a.cols)).toEqual([lastMessageRead(state.asked)]);
    expect(lastMessageRead(state.asked)).not.toContain('edited_at');
    await expect(backend.roomReactions('r1')).resolves.toEqual([]);
  });

  it('still says a voice note needs the update', async () => {
    const { backend } = cloud();
    await expect(backend.putRoomFile('r1', 'voice-note-4000ms.webm', 'AAAA')).rejects.toThrow(/needs its latest update/);
  });
});
