// THE PHONE SETS YOUR ROOM CARD AND GOES INVISIBLE, AS THE DESKTOP DOES.
//
// The desktop's Settings has a Rooms page once Rooms is on
// (renderer/src/team/rooms/RoomsSettings.tsx): show my full name, what your
// card shows, and go invisible. Each is a write to your own row in
// `room_profiles` (main/team/rooms.mts saveProfile, goInvisible, comeBack).
// The phone had no Rooms page: the parity ledger listed it and its four
// searchable rows as missing (node scripts/phone-parity.mjs, 2026-11-08). The
// phone is signed in to the same account, so it makes the same write itself.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { roomsPageShown, roomCardGroups, roomCardPatch, readMyRoomCard, saveMyRoomCard, ROOMS_SEARCH_ROWS } from '../mobile/src/lib/rooms-settings';
import { phoneSettingsRows } from '../mobile/src/lib/settings-rows';
import { searchSettings } from '../renderer/src/settings-search';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const me = (over = {}) => ({
  person_id: 'p-me', display_name: 'Ada L.', avatar_url: null, headline: null, bio: null, show_working: 'everyone',
  show_agents: true, show_level: true, show_status: true, show_activity: true, invisible_until: null, status_text: null, status_until: null, ...over,
});
const rows = (profile, fullName = 'Ada Lovelace') => roomCardGroups(profile, fullName, NOW).flatMap((g) => g.rows);
const row = (profile, id, fullName) => rows(profile, fullName).find((r) => r.id === id);
const withRooms = (rooms) => ({ workspace: { cloud: null, alpha: { rooms } } });

describe('when the page is there', () => {
  it('is there when the computer has Rooms on', () => {
    expect(roomsPageShown(withRooms(true))).toBe(true);
  });

  it('is not there when Rooms is off, or before the computer sent its settings', () => {
    expect(roomsPageShown(withRooms(false))).toBe(false);
    expect(roomsPageShown(null)).toBe(false);
    expect(roomsPageShown({ workspace: {} })).toBe(false);
  });

  it('is found by search only while it is there', () => {
    const find = (q, s) => searchSettings(q, { pages: ['rooms'], rows: phoneSettingsRows(s) }).map((h) => `${h.page}/${h.label}`);
    expect(find('invisible', withRooms(true))).toEqual(['rooms/Go invisible']);
    expect(find('full name', withRooms(true))).toEqual(['rooms/Show my full name']);
    expect(find('invisible', withRooms(false))).toEqual([]);
    for (const r of ROOMS_SEARCH_ROWS) expect(phoneSettingsRows(withRooms(true))).toContain(r);
  });
});

describe('what the page says, in the desktop\'s words', () => {
  it('groups the rows as the desktop does', () => {
    expect(roomCardGroups(me(), 'Ada Lovelace', NOW).map((g) => g.label)).toEqual(['Your name', 'Your card', 'Invisible']);
    expect(rows(me()).map((r) => r.label)).toEqual([
      'Show my full name', 'What you are working on', 'Show it to people outside your team',
      'How many agents are running', 'Your agent hours', 'Your status', 'Your activity on your page', 'Go invisible',
    ]);
  });

  it('says the name rooms show', () => {
    expect(row(me(), 'fullName')).toMatchObject({ on: false, desc: 'Off, rooms show you as Ada L.' });
    expect(row(me({ display_name: 'Ada Lovelace' }), 'fullName')).toMatchObject({ on: true, desc: 'On, rooms show you as Ada Lovelace.' });
    // No full name known: the switch reads off whatever the card says.
    expect(row(me({ display_name: 'Ada' }), 'fullName', '').on).toBe(false);
  });

  it('hides who sees your thread names once your card says Private thread', () => {
    expect(row(me({ show_working: 'none' }), 'working')).toMatchObject({ on: false, desc: 'Off, it reads Private thread. Your team still sees your shared threads on its board.' });
    expect(row(me({ show_working: 'none' }), 'outside')).toBeUndefined();
    expect(row(me({ show_working: 'team' }), 'outside')).toMatchObject({ on: false, desc: 'Off, they see Private thread and no activity.' });
    expect(row(me(), 'outside')).toMatchObject({ on: true, desc: 'On, everyone in your rooms sees the name and your activity.' });
  });

  it('says your activity is hidden only when it is', () => {
    expect(row(me({ show_activity: false }), 'activity')).toMatchObject({ on: false, desc: 'Off, people see only your progress.' });
    expect(row(me({ show_activity: undefined }), 'activity')).toMatchObject({ on: true, desc: null });
  });

  it('says how long you are invisible for', () => {
    expect(row(me(), 'invisible')).toMatchObject({ on: false, desc: 'Leave every room until you turn it off.' });
    expect(row(me({ invisible_until: new Date(NOW + 90 * 60_000).toISOString() }), 'invisible')).toMatchObject({ on: true, desc: 'You are invisible for 2 more hours. Nobody in your rooms can see you.' });
    expect(row(me({ invisible_until: new Date(NOW - 60_000).toISOString() }), 'invisible').on).toBe(false);
  });
});

describe('what each switch writes', () => {
  const patch = (id, on, profile = me(), fullName = 'Ada Lovelace') => roomCardPatch(id, on, { me: profile, fullName, now: NOW });

  it('writes your name whole, or with the last name cut to its initial', () => {
    expect(patch('fullName', true)).toEqual({ display_name: 'Ada Lovelace' });
    expect(patch('fullName', false, me({ display_name: 'Ada Lovelace' }))).toEqual({ display_name: 'Ada L.' });
    expect(patch('fullName', true, me(), '')).toEqual({ display_name: 'Ada L.' });
  });

  it('writes who sees what you are working on', () => {
    expect(patch('working', false)).toEqual({ show_working: 'none' });
    expect(patch('working', true, me({ show_working: 'none' }))).toEqual({ show_working: 'everyone' });
    expect(patch('outside', false)).toEqual({ show_working: 'team' });
    expect(patch('outside', true)).toEqual({ show_working: 'everyone' });
  });

  it('writes each of the card\'s own switches', () => {
    expect(patch('agents', false)).toEqual({ show_agents: false });
    expect(patch('level', false)).toEqual({ show_level: false });
    expect(patch('status', true)).toEqual({ show_status: true });
    expect(patch('activity', false)).toEqual({ show_activity: false });
  });

  it('goes invisible until you turn it off, held as a date ten years ahead, and comes back', () => {
    expect(patch('invisible', true)).toEqual({ invisible_until: new Date(NOW + 3650 * 24 * 60 * 60_000).toISOString() });
    expect(patch('invisible', false)).toEqual({ invisible_until: null });
  });

  it('refuses a switch the page does not have, or a value that is not on or off', () => {
    expect(patch('bio', true)).toBeNull();
    expect(patch('working', 'everyone')).toBeNull();
    expect(patch('invisible', null)).toBeNull();
  });
});

describe('the cloud', () => {
  const fake = (rowsBack = [me()]) => {
    const calls = [];
    return {
      calls,
      session: () => ({ user: { id: 'p-me' } }),
      async select(table, query) { calls.push(['select', table, query]); return table === 'people' ? [{ name: 'Ada Lovelace' }] : rowsBack; },
      async update(table, query, body) { calls.push(['update', table, query, body]); return rowsBack.map((r) => ({ ...r, ...body })); },
    };
  };

  it('reads only your own card and your own name', async () => {
    const c = fake();
    expect(await readMyRoomCard(c)).toEqual({ me: me(), fullName: 'Ada Lovelace' });
    expect(c.calls.map(([, t, q]) => [t, /person_id=eq\.p-me|id=eq\.p-me/.test(q)])).toEqual([['room_profiles', true], ['people', true]]);
  });

  it('is no card yet when the computer has not made one', async () => {
    expect((await readMyRoomCard(fake([]))).me).toBeNull();
  });

  it('sends the change to your own row and nothing else', async () => {
    const c = fake();
    const saved = await saveMyRoomCard(c, { show_working: 'none' });
    expect(c.calls).toEqual([['update', 'room_profiles', 'person_id=eq.p-me', { show_working: 'none' }]]);
    expect(saved.show_working).toBe('none');
  });

  it('refuses a column the card does not let you change', async () => {
    const c = fake();
    await expect(saveMyRoomCard(c, { person_id: 'p-other' })).rejects.toThrow();
    await expect(saveMyRoomCard(c, {})).rejects.toThrow();
    expect(c.calls).toEqual([]);
  });

  it('says so when there is no card to change', async () => {
    await expect(saveMyRoomCard(fake([]), { show_agents: false })).rejects.toThrow(/room card/);
  });

  it('does nothing signed out', async () => {
    const c = { ...fake(), session: () => null };
    await expect(readMyRoomCard(c)).rejects.toThrow(/signed in/);
  });
});

describe('the screen', () => {
  const src = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
  it('is a Workspace page shown by the same rule', () => {
    expect(src).toMatch(/id: 'rooms', label: 'Rooms', group: 'Workspace', Body: Rooms, shown: \(s\) => roomsPageShown\(s\.settings\)/);
  });
  it('draws each row from the rule and saves through the cloud', () => {
    expect(src).toMatch(/roomCardGroups\(/);
    expect(src).toMatch(/roomCardPatch\(/);
    expect(src).toMatch(/saveMyRoomCard\(/);
    expect(src).toMatch(/Making your room card/);
  });
  it('is in the browser preview, made up', () => {
    const preview = fs.readFileSync(new URL('../mobile/src/lib/preview.ts', import.meta.url), 'utf8');
    expect(preview).toMatch(/table === 'room_profiles'\) \{/);
  });
});
