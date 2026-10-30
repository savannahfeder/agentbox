// GROUPS FROM A PHONE, straight to the account with no computer between: the
// reads and writes main/team/rooms-supabase.mjs makes, over the phones' plain
// REST client (cloud-rest.ts). Row level security decides who sees and posts
// what (20261021000000_rooms.sql and the room migrations after it), so these
// only ask. A phone runs no agents, so it never publishes presence or hours,
// and never touches a profile or a membership.
//
// Both phone apps use it: the web app answers the desktop's `rooms` door with
// it (cloud-bridge.ts), and the iPhone app draws its Groups tab from it.
import type { cloudClient } from './cloud-rest';
import type { Room, RoomCard, RoomMention, RoomMessage, RoomProfile, RoomsState } from './types';
import { computerOf, type SettingsRow } from './phone-settings-view';
import { displayNameOf, wallCards as wallCardsJs } from '../../shared/room-cards.mjs';
import { Name } from '../../shared/product-name.mjs';

const wallCards = wallCardsJs as unknown as (o: Record<string, unknown>) => RoomCard[];

export type GroupsRest = Pick<ReturnType<typeof cloudClient>, 'session' | 'select' | 'insert' | 'rpc'>;

// The columns main/team/rooms-shape.mjs reads; the phone bundles cannot reach main/.
const PROFILE_FIELDS = ['display_name', 'avatar_url', 'headline', 'bio', 'show_working', 'show_agents', 'show_level', 'show_status', 'show_activity', 'invisible_until', 'status_text', 'status_until'];
const PRESENCE_FIELDS = ['gone', 'agents_running', 'working_on', 'working_private', 'working_at', 'hours_total', 'hours_week', 'week_start', 'hours_today', 'day', 'streak_days', 'active_days', 'hours_by_month', 'activity'];
export const GROUP_COLS = {
  profile: ['person_id', ...PROFILE_FIELDS, 'updated_at'].join(','),
  presence: ['person_id', 'device', ...PRESENCE_FIELDS, 'updated_at'].join(','),
  oldPresence: ['person_id', 'device', ...PRESENCE_FIELDS.filter((f) => f !== 'activity'), 'updated_at'].join(','),
  message: 'id,room_id,by_person,body,in_reply_to,mentions,created_at,edited_at,deleted_at',
  // A cloud from before 20261022000000_room_messages_do_more.sql.
  oldMessage: 'id,room_id,by_person,body,in_reply_to,mentions,created_at',
};

const HELD = 200;
// People, faces and who is working change slower than a chat; read them less often.
const PEOPLE_EVERY_MS = 30_000;
export const NOT_ON_PHONE = `Do this in ${Name} on your computer.`;

const notThere = (err: unknown) => /does not exist|could not find|42703|42P01|42883|PGRST20[245]/i.test(String((err as Error)?.message ?? err));
const inList = (ids: readonly string[]) => `in.(${ids.map(encodeURIComponent).join(',')})`;
const isoOf = (ms: number) => encodeURIComponent(new Date(ms).toISOString());

function meOf(c: GroupsRest): string {
  const id = c.session()?.user.id;
  if (!id) throw new Error('not signed in');
  return id;
}

export interface Group { id: string; name: string; kind: 'room' | 'group'; teamId: string | null; listed: boolean; inviteOnly: boolean; role: 'owner' | 'member'; members: number; createdAt: number }

const groupOut = (r: any): Group => ({
  id: r.id, name: r.name, kind: r.kind, teamId: r.team_id ?? null, listed: !!r.listed, inviteOnly: !!r.invite_only,
  role: r.role, members: Number(r.members) || 0, createdAt: Date.parse(r.created_at) || 0,
});

const messageOut = (r: any): RoomMessage => ({
  id: r.id, roomId: r.room_id, by: r.by_person ?? null, body: r.deleted_at ? '' : r.body, inReplyTo: r.in_reply_to ?? null,
  mentions: r.deleted_at ? [] : r.mentions ?? [], at: Date.parse(r.created_at),
  editedAt: r.edited_at ? Date.parse(r.edited_at) : null, deleted: !!r.deleted_at,
});

export async function myGroups(c: GroupsRest): Promise<Group[]> {
  meOf(c);
  return ((await c.rpc('my_rooms', {})) ?? []).map(groupOut);
}

/** Messages on the columns this cloud has; an old cloud is read without edits and deletes. */
async function readMessages(c: GroupsRest, query: string): Promise<RoomMessage[]> {
  try {
    return (await c.select('room_messages', `select=${GROUP_COLS.message}&${query}`)).map(messageOut);
  } catch (err) {
    if (!notThere(err)) throw err;
    return (await c.select('room_messages', `select=${GROUP_COLS.oldMessage}&${query.replace('&deleted_at=is.null', '')}`)).map(messageOut);
  }
}

/** The newest messages, oldest first; `after` and `before` read only past or short of a moment. */
export async function groupMessages(c: GroupsRest, roomId: string, { after, before, limit = HELD }: { after?: number; before?: number; limit?: number } = {}): Promise<RoomMessage[]> {
  meOf(c);
  const when = after ? `&created_at=gt.${isoOf(after)}` : before ? `&created_at=lt.${isoOf(before)}` : '';
  return (await readMessages(c, `room_id=eq.${encodeURIComponent(roomId)}${when}&order=created_at.desc&limit=${limit}`)).reverse();
}

/** My newest mentions in every group, however busy the group is. */
export async function myMentions(c: GroupsRest, limit = 50): Promise<RoomMessage[]> {
  const me = meOf(c);
  return readMessages(c, `mentions=cs.${encodeURIComponent(`{${me}}`)}&deleted_at=is.null&order=created_at.desc&limit=${limit}`);
}

export async function sendToGroup(c: GroupsRest, roomId: string, { body, inReplyTo = null, mentions = [] }: { body: string; inReplyTo?: string | null; mentions?: string[] }): Promise<RoomMessage> {
  const me = meOf(c);
  const words = String(body ?? '').trim();
  if (!words) throw new Error('Write something first.');
  const row = await c.insert('room_messages', { room_id: roomId, by_person: me, body: words, in_reply_to: inReplyTo, mentions });
  return messageOut(row);
}

/** The cloud keeps the later of this and what any other device said. */
export async function markGroupRead(c: GroupsRest, roomId: string, at: number) {
  meOf(c);
  await c.rpc('mark_room_read', { r: roomId, at: new Date(at).toISOString() });
}

export async function groupReads(c: GroupsRest): Promise<Map<string, number>> {
  const me = meOf(c);
  const rows = await c.select('room_reads', `select=room_id,read_at&person_id=eq.${encodeURIComponent(me)}`);
  return new Map(rows.map((r: any) => [r.room_id, Date.parse(r.read_at) || 0]));
}

/** A file a message links, as base64, or null. */
export async function groupFile(c: GroupsRest, roomId: string, name: string): Promise<string | null> {
  meOf(c);
  const rows = await c.select('room_files', `select=data&room_id=eq.${encodeURIComponent(roomId)}&name=eq.${encodeURIComponent(name)}&limit=1`);
  return rows[0]?.data ?? null;
}

type Named = { person_id: string; name: string; avatar_url: string | null; has_card: boolean };
export interface GroupPeople {
  people: Map<string, string[]>;
  names: Map<string, Named[] | null>;
  profiles: any[];
  presence: any[];
  teammates: string[];
  teamCards: { personId: string; title: string | null; state: string; visible: boolean; updatedAt: number }[];
  me: RoomProfile | null;
}

/**
 * Who is in each group, with what each lets a card show: names, faces, level,
 * what they are on and their agents. Teammates' thread names come from the
 * team's thread cards, as on the Mac.
 */
export async function groupPeople(c: GroupsRest, roomIds: readonly string[]): Promise<GroupPeople> {
  const me = meOf(c);
  const people = new Map<string, string[]>();
  const names = new Map<string, Named[] | null>();
  await Promise.all(roomIds.map(async (r) => {
    const [who, called] = await Promise.all([
      c.rpc('room_people', { r }),
      c.rpc('room_names', { r }).catch((err) => { if (notThere(err)) return null; throw err; }),
    ]);
    people.set(r, (who ?? []).map((x: any) => (typeof x === 'string' ? x : x?.room_people ?? x?.person_id)).filter(Boolean));
    names.set(r, called ? called.map((n: any) => ({ person_id: n.person_id, name: n.name ?? '', avatar_url: n.avatar_url ?? null, has_card: !!n.has_card })) : null);
  }));
  const everyone = [...new Set([me, ...[...people.values()].flat()])];
  const presence = async () => {
    try { return await c.select('room_presence', `select=${GROUP_COLS.presence}&person_id=${inList(everyone)}`); } catch (err) {
      if (!notThere(err)) throw err;
      return c.select('room_presence', `select=${GROUP_COLS.oldPresence}&person_id=${inList(everyone)}`);
    }
  };
  const [profiles, present, mates, cards] = await Promise.all([
    c.select('room_profiles', `select=${GROUP_COLS.profile}&person_id=${inList(everyone)}`),
    presence(),
    c.select('team_members', 'select=person_id').catch(() => []),
    c.select('thread_cards', 'select=person_id,title,state,visible,updated_at&state=eq.running').catch(() => []),
  ]);
  return {
    people, names, profiles, presence: present,
    teammates: [...new Set<string>(mates.map((m: any) => m.person_id))].filter((id) => id !== me),
    teamCards: cards.map((r: any) => ({ personId: r.person_id, title: r.title ?? null, state: r.state, visible: r.visible !== false, updatedAt: Date.parse(r.updated_at) || 0 })),
    me: (profiles.find((p: any) => p.person_id === me) as RoomProfile | undefined) ?? null,
  };
}

/** The Mac's rooms state (main/team/rooms.mjs `build`), without what only a Mac keeps: pins, mutes, my own running agents. */
export function groupsState({ rooms, people, names, profiles, presence, teammates, teamCards, me = null, messages, reads, mentioned, meId, now, error = null }: GroupPeople & {
  rooms: Group[]; messages: Map<string, RoomMessage[]>; reads: Map<string, number>; mentioned: RoomMessage[]; meId: string; now: number; error?: string | null;
}): RoomsState {
  const mentions: RoomMention[] = [];
  const shown: Room[] = rooms.map((r) => {
    const held = messages.get(r.id) ?? [];
    const readAt = reads.get(r.id) ?? 0;
    const unread = held.filter((m) => m.at > readAt && m.by !== meId && !m.deleted);
    const called = names.get(r.id) ?? null;
    const everyone = called?.map((n) => ({ id: n.person_id, name: n.has_card ? n.name : displayNameOf(n.name), avatarUrl: n.avatar_url ?? null })) ?? null;
    const nameOf = (id: string | null) => profiles.find((p) => p.person_id === id)?.display_name || everyone?.find((p) => p.id === id)?.name || '';
    const pool = new Map([...mentioned.filter((m) => m.roomId === r.id && m.at > readAt && m.by !== meId && !m.deleted), ...unread].map((m) => [m.id, m]));
    for (const m of pool.values()) {
      if (m.mentions.includes(meId)) mentions.push({ id: `room-mention:${m.id}`, messageId: m.id, roomId: r.id, roomName: r.name, by: m.by, byName: nameOf(m.by), body: m.body, at: m.at });
    }
    const wall = wallCards({ members: people.get(r.id) ?? [], profiles, presence, teammates, teamCards, meId, now, mine: null, names: called, listed: r.listed });
    return {
      ...r, pinned: false, muted: false, readAt, markedUnread: false, unread: unread.length,
      lastAt: held.at(-1)?.at ?? r.createdAt, agents: wall.reduce((n: number, c: any) => n + (c.agents ?? 0), 0), wall, people: everyone,
    } as Room;
  });
  return {
    on: true, ready: true, rooms: shown, messages: Object.fromEntries(shown.map((r) => [r.id, messages.get(r.id) ?? []])),
    me, ranks: {}, invites: [], mentions: mentions.sort((a, b) => b.at - a.at), error,
  };
}

export const NO_GROUPS: RoomsState = { on: true, ready: false, rooms: [], messages: {}, me: null, ranks: {}, invites: [], mentions: [], error: null };

const merge = (old: readonly RoomMessage[] = [], fresh: readonly RoomMessage[] = [], keep = HELD) => {
  const byId = new Map(old.map((m) => [m.id, m]));
  for (const m of fresh) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id))).slice(-keep);
};

/**
 * One account's groups, held between reads. A read asks every group for what
 * is newer than it holds, and every half minute reads the people and whole
 * chats again, which is where an edit or a delete shows up.
 */
export function phoneGroups(c: GroupsRest, { now = Date.now }: { now?: () => number } = {}) {
  let rooms: Group[] = [];
  let who: GroupPeople = { people: new Map(), names: new Map(), profiles: [], presence: [], teammates: [], teamCards: [], me: null };
  let messages = new Map<string, RoomMessage[]>();
  let reads = new Map<string, number>();
  let mentioned: RoomMessage[] = [];
  let peopleAt = -Infinity;
  let ready = false;
  let error: string | null = null;
  let held: string | null = null;
  let state: RoomsState = NO_GROUPS;
  let reading: Promise<RoomsState> | null = null;

  const build = () => {
    const meId = c.session()?.user.id;
    state = meId && ready ? groupsState({ rooms, ...who, messages, reads, mentioned, meId, now: now(), error }) : { ...NO_GROUPS, error };
    return state;
  };

  async function readOnce(): Promise<RoomsState> {
    const me = c.session()?.user.id;
    if (!me) { held = null; ready = false; return build(); }
    // Another account signed in on this device starts from nothing.
    if (held !== me) { held = me; rooms = []; messages = new Map(); reads = new Map(); mentioned = []; peopleAt = -Infinity; ready = false; }
    try {
      const got = await myGroups(c);
      const all = now() - peopleAt >= PEOPLE_EVERY_MS || got.some((r) => !rooms.some((x) => x.id === r.id));
      const [people, fresh, readRows, mine] = await Promise.all([
        all ? groupPeople(c, got.map((r) => r.id)) : null,
        Promise.all(got.map(async (r) => {
          const newest = messages.get(r.id)?.at(-1)?.at;
          return [r.id, await groupMessages(c, r.id, all || !newest ? {} : { after: newest })] as const;
        })),
        groupReads(c),
        myMentions(c).catch(() => mentioned),
      ]);
      if (c.session()?.user.id !== me) return build();
      if (people) { who = people; peopleAt = now(); }
      const next = new Map<string, RoomMessage[]>();
      for (const [id, list] of fresh) next.set(id, all ? merge([], list) : merge(messages.get(id), list));
      rooms = got;
      messages = next;
      // A read point moved here a moment ago may not be in the cloud's answer yet.
      reads = new Map(got.map((r) => [r.id, Math.max(readRows.get(r.id) ?? 0, reads.get(r.id) ?? 0)]));
      mentioned = mine;
      ready = true;
      error = null;
    } catch (err) {
      error = String((err as Error)?.message ?? err);
    }
    return build();
  }

  const refresh = () => (reading ??= readOnce().finally(() => { reading = null; }));

  async function send(roomId: string, body: string, { inReplyTo = null, mentions = [] }: { inReplyTo?: string | null; mentions?: string[] } = {}) {
    const m = await sendToGroup(c, roomId, { body, inReplyTo, mentions });
    messages.set(roomId, merge(messages.get(roomId), [m]));
    reads.set(roomId, Math.max(reads.get(roomId) ?? 0, m.at));
    build();
    return m;
  }

  async function markRead(roomId: string) {
    const last = messages.get(roomId)?.at(-1)?.at;
    if (!last || (reads.get(roomId) ?? 0) >= last) return;
    reads.set(roomId, last);
    build();
    await markGroupRead(c, roomId, last);
  }

  async function older(roomId: string) {
    const list = messages.get(roomId) ?? [];
    const got = await groupMessages(c, roomId, { before: list[0]?.at ?? now(), limit: 100 });
    messages.set(roomId, merge(list, got, Infinity));
    build();
    return got.length;
  }

  const ops: Record<string, (...a: any[]) => Promise<unknown>> = {
    refresh: async () => null,
    send: (roomId: string, body: string, opts?: { inReplyTo?: string | null; mentions?: string[] }) => send(roomId, body, opts),
    markRead: (roomId: string) => markRead(roomId),
    older: (roomId: string) => older(roomId),
    file: (roomId: string, name: string) => groupFile(c, roomId, name),
  };

  /** The desktop's `rooms` door (main/ipc.mjs `zero:rooms`), answered from here. */
  async function door({ op, args = [] }: { op: string; args?: unknown[] }) {
    const fn = ops[op];
    if (!fn) return { ok: false as const, error: NOT_ON_PHONE, rooms: state };
    try {
      if (op === 'refresh' || !ready) await refresh();
      const value = await fn(...(Array.isArray(args) ? args : [args]));
      return { ok: true as const, value: value ?? null, rooms: state };
    } catch (err) {
      return { ok: false as const, error: String((err as Error)?.message ?? err), rooms: state };
    }
  }

  return { state: () => state, refresh, send, markRead, older, door, forget: () => { held = null; ready = false; state = NO_GROUPS; } };
}

/** Groups is on when the computer heard from last says so in its settings copy (shared/phone-settings.mjs). */
export function groupsOn(rows: readonly SettingsRow[] | null | undefined): boolean {
  return computerOf([...(rows ?? [])])?.settings?.workspace?.alpha?.rooms === true;
}

/**
 * What the web app's snapshot says of Groups: on or off, and the rooms with
 * who I am. `signedIn` and `configured` stay false so none of the team's own
 * pages draw: those are the Mac's.
 */
export function groupsSnapshot({ settingsRows, session, groups }: { settingsRows: readonly SettingsRow[]; session: { user: { id: string; email?: string | null } } | null; groups: RoomsState }) {
  const on = !!session && groupsOn(settingsRows);
  if (!on) return { alpha: { rooms: false }, team: null };
  const name = groups.me?.display_name ?? '';
  return {
    alpha: { rooms: true },
    team: {
      configured: false, canSignIn: false, started: true, signedIn: false, signingIn: null,
      me: { id: session!.user.id, email: session!.user.email ?? '', name, avatarUrl: groups.me?.avatar_url ?? null },
      team: null, invites: [], sent: [], people: [], cards: [], lastSyncAt: null, error: null, rooms: groups,
    },
  };
}
