// THE WEB APP ANSWERS THE GROUPS DOORS.
//
// What was missing (2026-10-28, w-9f9c2570e2): the web app is the desktop's
// own screens over a `window.zero` built from cloud rows (cloud-bridge.ts).
// Its snapshot carried no `alpha` and no rooms, and its `rooms` door was one
// of the doors that throw "not here", so the desktop's Groups never drew in
// a browser even for someone with Groups on. Measured on the door the bridge
// installs and the snapshot part it adds, over a stand-in client: refresh,
// send, reply and mark read answer as the Mac's door does
// (`{ ok, value, rooms }`); going invisible, presence, mute and the rest that
// belong to a computer answer not here, in words; the snapshot says Groups
// is on only when the computer's settings do, and carries no team pages.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { groupsSnapshot, phoneGroups } from '../renderer/src/phone-groups';

const ME = '00000000-0000-4000-8000-000000000001';
const SAM = '00000000-0000-4000-8000-000000000002';
const T0 = Date.parse('2026-10-28T15:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

function standIn() {
  const calls = [];
  const messages = [{ id: 'm1', room_id: 'r-1', by_person: SAM, body: 'morning', in_reply_to: null, mentions: [], created_at: iso(T0 - 60_000), edited_at: null, deleted_at: null }];
  return {
    calls,
    session: () => ({ access_token: 'x', refresh_token: 'y', expires_at: T0 + 3_600_000, user: { id: ME, email: 'ada@example.com' } }),
    async select(table, query) {
      calls.push({ kind: 'select', table, query });
      if (table === 'room_messages') return /mentions=/.test(query) ? [] : [...messages].reverse();
      if (table === 'room_profiles') return [{ person_id: ME, display_name: 'Ada L.' }, { person_id: SAM, display_name: 'Sam R.' }];
      return [];
    },
    async insert(table, row) {
      calls.push({ kind: 'insert', table, row });
      const made = { id: `m${messages.length + 1}`, created_at: iso(T0), edited_at: null, deleted_at: null, ...row };
      messages.push(made);
      return made;
    },
    async rpc(name, args) {
      calls.push({ kind: 'rpc', name, args });
      if (name === 'my_rooms') return [{ id: 'r-1', name: 'Northwind', kind: 'room', team_id: 't-1', listed: false, invite_only: false, role: 'member', members: 2, created_at: iso(T0 - 86_400_000) }];
      if (name === 'room_people') return [ME, SAM];
      return null;
    },
  };
}

describe('the rooms door on the web app', () => {
  it('refresh answers with the groups, as the Mac’s door does', async () => {
    const door = phoneGroups(standIn(), { now: () => T0 }).door;
    const res = await door({ op: 'refresh' });
    expect(res.ok).toBe(true);
    expect(res.rooms.rooms.map((r) => r.name)).toEqual(['Northwind']);
    expect(res.rooms.messages['r-1'].map((m) => m.body)).toEqual(['morning']);
  });

  it('send and reply post as me and come back in the answer', async () => {
    const c = standIn();
    const door = phoneGroups(c, { now: () => T0 }).door;
    await door({ op: 'refresh' });
    const sent = await door({ op: 'send', args: ['r-1', 'on it', { inReplyTo: 'm1', mentions: [SAM] }] });
    expect(sent.ok).toBe(true);
    expect(sent.value).toMatchObject({ body: 'on it', inReplyTo: 'm1', by: ME });
    expect(sent.rooms.messages['r-1'].map((m) => m.body)).toEqual(['morning', 'on it']);
    expect(c.calls.find((x) => x.kind === 'insert').row).toMatchObject({ by_person: ME, in_reply_to: 'm1', mentions: [SAM] });
  });

  it('mark read answers ok and clears the group', async () => {
    const c = standIn();
    const door = phoneGroups(c, { now: () => T0 }).door;
    await door({ op: 'refresh' });
    const res = await door({ op: 'markRead', args: ['r-1'] });
    expect(res.ok).toBe(true);
    expect(res.rooms.rooms[0].unread).toBe(0);
    expect(c.calls.some((x) => x.name === 'mark_room_read')).toBe(true);
  });

  it('what belongs to a computer answers not here, in words, and touches nothing', async () => {
    const c = standIn();
    const door = phoneGroups(c, { now: () => T0 }).door;
    await door({ op: 'refresh' });
    const before = c.calls.length;
    for (const op of ['goInvisible', 'comeBack', 'saveProfile', 'publish', 'mute', 'pin', 'tick', 'start', 'stop', 'nonsense']) {
      const res = await door({ op, args: ['r-1'] });
      expect(res.ok, op).toBe(false);
      expect(res.error, op).toMatch(/computer/i);
    }
    expect(c.calls.length).toBe(before);
  });
});

describe('the snapshot’s Groups part', () => {
  const settings = (rooms) => [{ device: 'aaaaaaaaaaaa', name: 'Studio', updated_at: iso(T0), settings: { workspace: { alpha: { rooms } } } }];
  const g = { on: true, ready: true, rooms: [], messages: {}, me: null, ranks: {}, invites: [], mentions: [], error: null };
  const session = { user: { id: ME, email: 'ada@example.com' } };

  it('with Groups on: alpha says so, and the team carries the rooms and who I am, with no team pages', () => {
    const out = groupsSnapshot({ settingsRows: settings(true), session, groups: g });
    expect(out.alpha).toEqual({ rooms: true });
    expect(out.team).toMatchObject({ configured: false, signedIn: false, me: { id: ME }, rooms: g, people: [], cards: [] });
  });

  it('with Groups off, or signed out: nothing about Groups', () => {
    expect(groupsSnapshot({ settingsRows: settings(false), session, groups: g })).toEqual({ alpha: { rooms: false }, team: null });
    expect(groupsSnapshot({ settingsRows: settings(true), session: null, groups: g })).toEqual({ alpha: { rooms: false }, team: null });
  });

  it('is what the bridge puts in its snapshot, and the rooms door is the phone’s', () => {
    const src = fs.readFileSync(new URL('../renderer/src/cloud-bridge.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/groupsSnapshot\(/);
    expect(src).toMatch(/rooms:\s*\(p[^)]*\)\s*=>\s*groups\.door\(/);
  });
});
