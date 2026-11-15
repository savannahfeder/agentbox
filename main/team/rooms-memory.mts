// ROOMS IN MEMORY (w-3d0fa23ffb), with the rules of
// cloud/supabase/migrations/20261021000000_rooms.sql, so the app's rooms can
// be tested with several people and no network. tests/rooms-backends-agree
// runs one scenario against this and against a real database.
import crypto from 'node:crypto';
import type { MemoryCloud } from './memory-cloud.mts';
import type { RoomDecision, RoomEvent, RoomFileMark, RoomMessage, RoomPresenceRow, RoomProfile, RoomReaction } from './rooms.mts';
import { PROFILE_FIELDS, PRESENCE_FIELDS, pick, roomOut, messageOut, reactionOut, decisionOut, ROOM_FILE_NAME, ROOM_FILE_MAX_DATA, ROOM_FILE_MAX_BYTES, fileExists } from './rooms-shape.mts';

export const GENERAL_ROOM = '9e9e9e9e-0000-4000-8000-000000000001';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ATTACHMENT = /\]\(attachments\/([A-Za-z0-9][A-Za-z0-9_.-]{0,159})\)/g;
// 1 to 4000 characters once trimmed, counted as Postgres's char_length counts:
// an emoji is one character, not the two halves JavaScript's length sees.
const fitsAMessage = (text: unknown) => { const n = [...String(text).trim()].length; return n >= 1 && n <= 4000; };

const PROFILE_DEFAULTS = { display_name: '', avatar_url: null, headline: null, bio: null, show_working: 'team', show_agents: true, show_level: true, show_status: true, show_activity: true, invisible_until: null, status_text: null, status_until: null };
const PRESENCE_DEFAULTS = { gone: false, agents_running: 0, working_on: null, working_private: false, working_at: null, hours_total: 0, hours_week: 0, week_start: null, hours_today: 0, day: null, streak_days: 0, active_days: [], hours_by_month: [], activity: [] };

export interface MemoryRoom {
  id: string;
  name: string;
  kind: string;
  teamId: string | null;
  listed: boolean;
  inviteOnly?: boolean;
  createdBy: string | null;
  createdAt: number;
}
export interface MemoryRoomMember { roomId: string; personId: string; role: string; joinedAt: number }
export interface MemoryRoomLink { token: string; roomId: string; createdBy: string; createdAt: number; revokedAt: number | null }
export interface MemoryRoomInvite { roomId: string; email: string; invitedBy: string; createdAt: number; acceptedAt: number | null }
export interface MemoryRoomFile { roomId: string; name: string; byPerson: string; data: string; createdAt: number }

/** What rooms add to the cloud; each is made the first time rooms look. */
export interface MemoryRoomsFields {
  rooms?: Map<string, MemoryRoom>;
  roomMembers?: MemoryRoomMember[];
  roomLinks?: MemoryRoomLink[];
  roomInvites?: MemoryRoomInvite[];
  roomProfiles?: Map<string, RoomProfile>;
  roomPresence?: Map<string, RoomPresenceRow>;
  roomMessages?: RoomMessage[];
  roomReads?: Map<string, number>;
  roomReactions?: Map<string, RoomReaction>;
  roomDecisions?: Map<string, RoomDecision>;
  roomFileMarks?: (RoomFileMark & { roomId: string })[];
  roomFiles?: Map<string, MemoryRoomFile>;
  roomActs?: { personId: string; kind: string; at: number }[];
}

type RoomsCloud = MemoryCloud & Required<MemoryRoomsFields>;

type MemoryRoomEvent =
  | { kind: 'message'; message: RoomMessage; roomId: string }
  | { kind: 'reaction'; reaction: RoomReaction }
  | { kind: 'membership'; roomId: string }
  | { kind: 'decision' | 'fileMark'; roomId: string }
  | { kind: 'profile' | 'presence' };

function state(cloud: MemoryCloud): RoomsCloud {
  cloud.rooms ??= new Map();
  cloud.roomMembers ??= [];
  cloud.roomLinks ??= [];
  cloud.roomInvites ??= [];
  cloud.roomProfiles ??= new Map();
  cloud.roomPresence ??= new Map();
  cloud.roomMessages ??= [];
  cloud.roomReads ??= new Map();
  cloud.roomReactions ??= new Map(); // `${messageId}:${personId}:${emoji}` -> reactionOut row
  cloud.roomDecisions ??= new Map(); // `${roomId}:${messageId}:${kind}` -> decisionOut row
  cloud.roomFiles ??= new Map(); // `${roomId}:${name}` -> { roomId, name, byPerson, data, createdAt }
  cloud.roomActs ??= []; // { personId, kind, at }: edits and reactions, for their limits
  cloud.roomFileMarks ??= []; // { roomId, id, by, mark, at }: comments and approvals on a room's files
  if (!cloud.rooms.has(GENERAL_ROOM)) cloud.rooms.set(GENERAL_ROOM, { id: GENERAL_ROOM, name: 'Coworking', kind: 'room', teamId: null, listed: true, createdBy: null, createdAt: 0 });
  // Every team has its room, named after it (the team_room_kept trigger).
  for (const t of cloud.teams.values()) {
    const room = [...cloud.rooms.values()].find((r) => r.teamId === t.id);
    if (!room) cloud.rooms.set(crypto.randomUUID(), { id: null!, name: String(t.name).slice(0, 40), kind: 'room', teamId: t.id, listed: false, createdBy: t.createdBy ?? null, createdAt: cloud.now() });
    else room.name = String(t.name).slice(0, 40);
  }
  for (const [id, r] of cloud.rooms) r.id ??= id;
  return cloud as RoomsCloud;
}

export function roomsMemory(cloud: MemoryCloud, personId: string, helpers: { confirmedEmail: () => string | null; refuse: (what: string) => never }) {
  const { confirmedEmail } = helpers;
  const refuse: (what: string) => never = helpers.refuse;
  const now = () => cloud.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const emit = (e: MemoryRoomEvent) => cloud.events.emit('rooms', e);

  const roomsOf = (p: string) => {
    const s = state(cloud);
    const teams = new Set(s.members.filter((m) => m.personId === p).map((m) => m.teamId));
    const out = new Set(s.roomMembers.filter((m) => m.personId === p).map((m) => m.roomId));
    for (const r of s.rooms.values()) if (r.teamId && teams.has(r.teamId)) out.add(r.id);
    return out;
  };
  const inRoom = (r: string) => roomsOf(personId).has(r);
  const sharesRoom = (p: string) => { const mine = roomsOf(personId); return [...roomsOf(p)].some((r) => mine.has(r)); };
  const peopleOf = (r: string) => {
    const s = state(cloud);
    const room = s.rooms.get(r);
    const out = new Set(s.roomMembers.filter((m) => m.roomId === r).map((m) => m.personId));
    if (room?.teamId) for (const m of s.members) if (m.teamId === room.teamId) out.add(m.personId);
    return out;
  };
  const ownsRoom = (r: string) => {
    const s = state(cloud);
    if (s.roomMembers.some((m) => m.roomId === r && m.personId === personId && m.role === 'owner')) return true;
    const room = s.rooms.get(r);
    return !!room?.teamId && s.members.some((m) => m.teamId === room.teamId && m.personId === personId && m.role === 'owner');
  };
  const visible = (p: string) => { const until = Date.parse(state(cloud).roomProfiles.get(p)?.invisible_until ?? ''); return !(until > now()); };
  const limit = (what: string, used: number, n: number) => { if (used >= n) refuse(`too many ${what} for now`); };
  const act = (what: string, n: number, per: number) => {
    const s = state(cloud);
    limit(what, s.roomActs.filter((a) => a.personId === personId && a.kind === what && a.at > now() - per).length, n);
    s.roomActs = s.roomActs.filter((a) => !(a.personId === personId && a.at < now() - HOUR));
    s.roomActs.push({ personId, kind: what, at: now() });
  };
  const copy = (m: RoomMessage) => ({ ...m, mentions: [...m.mentions] });
  // A message I may change: in a room I am in, and mine.
  const myMessage = (id: string, what: string) => {
    const m = state(cloud).roomMessages.find((x) => x.id === id);
    if (!m || !inRoom(m.roomId)) refuse(`${what} a message in a room you are not in`);
    if (m.by !== personId) refuse(`${what} somebody else's message`);
    return m;
  };

  const join = (r: string) => {
    const s = state(cloud);
    if (inRoom(r)) return r;
    limit('joins', s.roomMembers.filter((m) => m.personId === personId && m.joinedAt > now() - HOUR).length, 30);
    if (peopleOf(r).size >= 500) refuse('join a full room');
    s.roomMembers.push({ roomId: r, personId, role: 'member', joinedAt: now() });
    emit({ kind: 'membership', roomId: r });
    return r;
  };

  const dropMember = (r: string, p: string) => {
    const s = state(cloud);
    const row = s.roomMembers.find((m) => m.roomId === r && m.personId === p);
    if (!row) return;
    s.roomMembers = s.roomMembers.filter((m) => m !== row);
    const room = s.rooms.get(r);
    if (room && !room.teamId) {
      const left = s.roomMembers.filter((m) => m.roomId === r);
      if (!left.length) { if (!room.listed) deleteRoom(r); }
      else if (row.role === 'owner' && !left.some((m) => m.role === 'owner')) {
        left.sort((a, b) => a.joinedAt - b.joinedAt || a.personId.localeCompare(b.personId))[0].role = 'owner';
      }
    }
    emit({ kind: 'membership', roomId: r });
  };

  const deleteRoom = (r: string) => {
    const s = state(cloud);
    s.rooms.delete(r);
    s.roomMembers = s.roomMembers.filter((m) => m.roomId !== r);
    s.roomLinks = s.roomLinks.filter((l) => l.roomId !== r);
    s.roomInvites = s.roomInvites.filter((i) => i.roomId !== r);
    s.roomMessages = s.roomMessages.filter((m) => m.roomId !== r);
    for (const [k, x] of s.roomReactions) if (x.roomId === r) s.roomReactions.delete(k);
    for (const [k, x] of s.roomDecisions) if (x.roomId === r) s.roomDecisions.delete(k);
    for (const [k, f] of s.roomFiles) if (f.roomId === r) s.roomFiles.delete(k);
    s.roomFileMarks = s.roomFileMarks.filter((x) => x.roomId !== r);
  };

  const room = (r: string) => state(cloud).rooms.get(r);
  const liveLink = (r: string) => state(cloud).roomLinks.find((l) => l.roomId === r && l.createdBy === personId && !l.revokedAt);
  const newLink = (r: string) => { const l = { token: crypto.randomUUID().replaceAll('-', ''), roomId: r, createdBy: personId, createdAt: now(), revokedAt: null }; state(cloud).roomLinks.push(l); return l.token; };
  const faces = (ids: string[], n: number) => ids.map((p) => state(cloud).roomProfiles.get(p) as RoomProfile).filter(Boolean)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, n)
    .map((p) => ({ name: p.display_name, avatar: p.avatar_url }));
  const freshAgents = (ids: string[]) => [...state(cloud).roomPresence.values()]
    .filter((p) => ids.includes(p.person_id) && !p.gone && Date.parse(p.updated_at) > now() - 15 * MIN);

  return {
    async myRooms() {
      const s = state(cloud);
      return [...roomsOf(personId)].map((id) => s.rooms.get(id) as MemoryRoom).filter(Boolean)
        .sort((a, b) => (a.teamId ? 0 : 1) - (b.teamId ? 0 : 1) || a.createdAt - b.createdAt)
        .map((r) => roomOut({ id: r.id, name: r.name, kind: r.kind, team_id: r.teamId, listed: r.listed, invite_only: !!r.inviteOnly, role: ownsRoom(r.id) ? 'owner' : 'member', members: peopleOf(r.id).size, created_at: iso(r.createdAt) }));
    },

    async roomPeople(r: string) {
      return inRoom(r) ? [...peopleOf(r)] : [];
    },

    async roomNames(r: string) {
      if (!inRoom(r)) return [];
      const s = state(cloud);
      return [...peopleOf(r)].map((p) => {
        const card = s.roomProfiles.get(p);
        const person = cloud.people?.get(p);
        return { person_id: p, name: card?.display_name || person?.name || '', avatar_url: card?.avatar_url ?? person?.avatarUrl ?? null, has_card: !!card };
      });
    },

    async roomProfiles(ids: string[] | null | undefined) {
      const s = state(cloud);
      return (ids ?? []).map((p) => s.roomProfiles.get(p) as RoomProfile)
        .filter((row) => row && (row.person_id === personId || (sharesRoom(row.person_id) && visible(row.person_id))))
        .map((row) => structuredClone(row));
    },

    async roomPresence(ids: string[] | null | undefined) {
      const want = new Set(ids ?? []);
      return [...state(cloud).roomPresence.values()]
        .filter((row) => want.has(row.person_id))
        .filter((row) => row.person_id === personId || (!row.gone && sharesRoom(row.person_id) && visible(row.person_id)))
        .map((row) => structuredClone(row));
    },

    async myRoomProfile() {
      const row = state(cloud).roomProfiles.get(personId);
      return row ? structuredClone(row) : null;
    },

    async saveRoomProfile(fields: Record<string, unknown>) {
      const s = state(cloud);
      const row = { ...PROFILE_DEFAULTS, ...(s.roomProfiles.get(personId) ?? {}), ...pick(fields, PROFILE_FIELDS), person_id: personId, updated_at: iso(now()) };
      if (String(row.display_name).length > 40) refuse('a name that long');
      if (!['none', 'team', 'everyone'].includes(row.show_working)) refuse('that choice of who sees your work');
      s.roomProfiles.set(personId, row);
      emit({ kind: 'profile' });
      return structuredClone(row);
    },

    async putPresence(device: string, fields: Record<string, unknown>) {
      if (!/^[0-9a-f]{12}$/.test(String(device))) refuse('presence for no computer');
      const s = state(cloud);
      const key = `${personId}:${device}`;
      const row = { ...PRESENCE_DEFAULTS, ...(s.roomPresence.get(key) ?? {}), ...pick(fields, PRESENCE_FIELDS), person_id: personId, device, updated_at: iso(now()) };
      if (row.working_on != null && String(row.working_on).length > 64) refuse('a thread name that long');
      if ((row.active_days ?? []).length > 60) refuse('that many days');
      if (!Array.isArray(row.activity) || row.activity.length > 36) refuse('that much activity');
      s.roomPresence.set(key, row);
      emit({ kind: 'presence' });
    },

    async roomMessages(r: string, { before = null, limit: n = 200 }: { before?: number | null; limit?: number } = {}) {
      if (!inRoom(r)) return [];
      return state(cloud).roomMessages
        .filter((m) => m.roomId === r && (before == null || m.at < before))
        .slice(-n).map(copy);
    },

    async roomMentions({ limit: n = 50 }: { limit?: number } = {}) {
      return state(cloud).roomMessages.filter((m) => !m.deleted && m.mentions.includes(personId) && inRoom(m.roomId))
        .slice(-n).reverse().map(copy);
    },

    async sendRoomMessage(r: string, { body, inReplyTo = null, mentions = [] }: { body?: unknown; inReplyTo?: string | null; mentions?: string[] }) {
      const s = state(cloud);
      if (!inRoom(r)) refuse('write in a room you are not in');
      const text = String(body ?? '');
      if (!fitsAMessage(text)) refuse('a message that empty or that long');
      limit('messages', s.roomMessages.filter((m) => m.by === personId && m.at > now() - MIN).length, 20);
      if (inReplyTo && !s.roomMessages.some((m) => m.id === inReplyTo && m.roomId === r)) refuse('a reply to a message in another room');
      const people = peopleOf(r);
      const msg = messageOut({ id: crypto.randomUUID(), room_id: r, by_person: personId, body: text, in_reply_to: inReplyTo, mentions: [...new Set(mentions)].filter((p) => people.has(p)), created_at: iso(now()) });
      s.roomMessages.push(msg);
      emit({ kind: 'message', message: { ...msg }, roomId: r });
      return { ...msg, mentions: [...msg.mentions] };
    },

    async editRoomMessage(id: string, { body, mentions = [] }: { body?: unknown; mentions?: string[] | null } = {}) {
      const m = myMessage(id, 'edit');
      if (m.deleted) refuse('edit a deleted message');
      const text = String(body ?? '');
      if (!fitsAMessage(text)) refuse('a message that empty or that long');
      act('edits', 20, MIN);
      const people = peopleOf(m.roomId);
      Object.assign(m, { body: text, editedAt: now(), mentions: [...new Set(mentions ?? [])].filter((p) => people.has(p)) });
      emit({ kind: 'message', message: copy(m), roomId: m.roomId });
      return copy(m);
    },

    async deleteRoomMessage(id: string) {
      const s = state(cloud);
      const m = myMessage(id, 'delete');
      if (m.deleted) return;
      const named = new Set([...m.body.matchAll(ATTACHMENT)].map((x) => x[1]));
      Object.assign(m, { body: '', mentions: [], deleted: true });
      for (const [k, x] of s.roomReactions) if (x.messageId === id) s.roomReactions.delete(k);
      for (const [k, f] of s.roomFiles) if (f.roomId === m.roomId && f.byPerson === personId && named.has(f.name)) s.roomFiles.delete(k);
      emit({ kind: 'message', message: copy(m), roomId: m.roomId });
    },

    // Taken-back ones too, since the service folds them, as reactions are read.
    async roomDecisions(r: string) {
      if (!inRoom(r)) refuse('read a room you are not in');
      return [...state(cloud).roomDecisions.values()].filter((x) => x.roomId === r).map((x) => ({ ...x }));
    },

    // A message in the room gives its own words and author. A project's decision,
    // or one filed from a conversation (`chat:<uid>`), has no message here, so only
    // then is the caller's word taken.
    async markRoomDecision(r: string, { messageId, kind, body, saidBy = null, project = null, on = true }: { messageId: string; kind: string; body?: unknown; saidBy?: string | null; project?: unknown; on?: boolean }) {
      const s = state(cloud);
      if (!inRoom(r)) refuse('mark a decision in a room you are not in');
      if (kind !== 'decision' && kind !== 'priority') refuse('a mark that is neither a decision nor priorities');
      const key = `${r}:${messageId}:${kind}`;
      if (!on) {
        const had = s.roomDecisions.get(key);
        if (had) { s.roomDecisions.set(key, { ...had, on: false, at: now() }); emit({ kind: 'decision', roomId: r }); }
        return;
      }
      const m = s.roomMessages.find((x) => x.id === messageId && x.roomId === r) ?? null;
      const elsewhere = !m && (!!project || String(messageId).startsWith('chat:'));
      if (!elsewhere && (!m || m.deleted)) refuse('mark a message that is not in this room');
      const words = elsewhere ? String(body ?? '').trim() : m!.body;
      if (!words || words.length > 4000) refuse('a decision that empty or that long');
      s.roomDecisions.set(key, decisionOut({
        room_id: r, message_id: messageId, kind, project: elsewhere && project ? String(project).slice(0, 120) : null, body: words,
        said_by: elsewhere ? (saidBy != null && peopleOf(r).has(saidBy) ? saidBy : null) : m!.by, marked_by: personId, is_on: true, updated_at: iso(now()),
      }));
      emit({ kind: 'decision', roomId: r });
    },

    async roomReactions(r: string) {
      if (!inRoom(r)) return [];
      return [...state(cloud).roomReactions.values()].filter((x) => x.roomId === r)
        .sort((a, b) => a.at - b.at).slice(-1000).map((x) => ({ ...x }));
    },

    async reactRoomMessage(id: string, emoji: unknown, on = true) {
      const s = state(cloud);
      const m = s.roomMessages.find((x) => x.id === id);
      if (!m || !inRoom(m.roomId)) refuse('react in a room you are not in');
      if (m.deleted) refuse('react to a deleted message');
      const e = String(emoji ?? '');
      const n = [...e].length;
      if (n < 1 || n > 16 || !/[^ ]/.test(e)) refuse('a reaction that is not one emoji');
      act('reactions', 60, MIN);
      const key = `${id}:${personId}:${e}`;
      if (!on && !s.roomReactions.has(key)) return;
      const row = reactionOut({ message_id: id, room_id: m.roomId, person_id: personId, emoji: e, is_on: !!on, updated_at: iso(now()) });
      s.roomReactions.set(key, row);
      emit({ kind: 'reaction', reaction: { ...row } });
    },

    async putRoomFile(r: string, name: unknown, data: unknown) {
      const s = state(cloud);
      const n = String(name ?? '');
      const d = String(data ?? '');
      limit('files', [...s.roomFiles.values()].filter((f) => f.byPerson === personId && f.createdAt > now() - 10 * MIN).length, 80);
      if (!inRoom(r)) refuse('send a file to a room you are not in');
      if (!ROOM_FILE_NAME.test(n)) refuse('a file name that is not a plain name');
      if (d.length > ROOM_FILE_MAX_DATA || Buffer.from(d, 'base64').length > ROOM_FILE_MAX_BYTES) refuse('a file that big');
      if (s.roomFiles.has(`${r}:${n}`)) throw fileExists(n);
      s.roomFiles.set(`${r}:${n}`, { roomId: r, name: n, byPerson: personId, data: d, createdAt: now() });
      return n;
    },

    async roomFile(r: string, name: string) {
      if (!inRoom(r)) return null;
      return state(cloud).roomFiles.get(`${r}:${name}`)?.data ?? null;
    },

    // The mark is not believed by whoever reads it; each copy cleans it.
    async roomFileMarks(r: string) {
      if (!inRoom(r)) refuse('read a room you are not in');
      return state(cloud).roomFileMarks.filter((x) => x.roomId === r).map(({ roomId: _r, ...x }) => ({ ...x, mark: { ...x.mark } }));
    },

    async markRoomFile(r: string, { id, mark }: { id?: unknown; mark?: unknown }) {
      const s = state(cloud);
      if (!inRoom(r)) refuse('comment in a room you are not in');
      const key = String(id ?? '');
      if (!/^[\w-]{1,64}$/.test(key)) refuse('a mark with no id');
      if (!mark || typeof mark !== 'object' || JSON.stringify(mark).length > 24000) refuse('a mark that big');
      if (s.roomFileMarks.some((x) => x.roomId === r && x.by === personId && x.id === key)) return;
      s.roomFileMarks.push({ roomId: r, id: key, by: personId, mark: { ...mark }, at: now() });
      emit({ kind: 'fileMark', roomId: r });
    },

    async roomReads() {
      return [...state(cloud).roomReads].filter(([k]) => k.endsWith(`:${personId}`)).map(([k, readAt]) => ({ roomId: k.split(':')[0], readAt }));
    },

    async markRoomRead(r: string, at: number) {
      if (!inRoom(r)) refuse('read a room you are not in');
      const key = `${r}:${personId}`;
      const s = state(cloud);
      s.roomReads.set(key, Math.max(s.roomReads.get(key) ?? 0, Math.min(at, now())));
    },

    // Unlike markRoomRead, this may move the read point back.
    async markRoomUnread(r: string, at: unknown) {
      if (!inRoom(r)) refuse('mark unread a room you are not in');
      if (at == null || !Number.isFinite(Number(at))) refuse('mark a room unread from no message');
      state(cloud).roomReads.set(`${r}:${personId}`, Math.min(Number(at), now()));
    },

    async roomLink(r: string) {
      if (!inRoom(r)) refuse('make a link to a room you are not in');
      if (room(r)?.kind === 'group') refuse('a link to a group');
      if (room(r)?.inviteOnly) refuse('a link to a room that takes only people its members invite');
      return liveLink(r)?.token ?? newLink(r);
    },

    async revokeRoomLink(r: string) {
      if (!inRoom(r)) refuse('turn off a link to a room you are not in');
      for (const l of state(cloud).roomLinks) if (l.roomId === r && !l.revokedAt && (l.createdBy === personId || ownsRoom(r))) l.revokedAt = now();
      return newLink(r);
    },

    async joinRoomByLink(token: string) {
      const l = state(cloud).roomLinks.find((x) => x.token === token && !x.revokedAt);
      if (!l) refuse('an invite link that does not work any more');
      if (room(l.roomId)?.kind === 'group') refuse('join a group by link');
      if (room(l.roomId)?.inviteOnly) refuse('join by link a room that takes only people its members invite');
      return join(l.roomId);
    },

    async joinListedRoom(r: string) {
      if (!room(r)?.listed) refuse('join a room not open to everyone');
      return join(r);
    },

    async listedRooms() {
      return [...state(cloud).rooms.values()].filter((r) => r.listed).map((r) => {
        const ids = [...peopleOf(r.id)];
        const members = new Set(state(cloud).roomMembers.filter((m) => m.roomId === r.id).map((m) => m.personId));
        return {
          id: r.id, name: r.name, members: ids.length,
          hereNow: new Set(freshAgents([...members]).filter((p) => visible(p.person_id)).map((p) => p.person_id)).size,
          joined: inRoom(r.id), faces: faces([...members].filter(visible), 4), createdAt: r.createdAt ?? 0,
        };
      }).sort((a, b) => b.members - a.members || a.createdAt - b.createdAt);
    },

    async roomPreview(token: string) {
      const l = state(cloud).roomLinks.find((x) => x.token === token && !x.revokedAt);
      const r = l && room(l.roomId);
      if (!r || r.inviteOnly) return null;
      const ids = [...peopleOf(r.id)];
      const shown = ids.filter(visible);
      const by = ids.includes(l.createdBy) ? state(cloud).roomProfiles.get(l.createdBy) : null;
      return {
        name: r.name, members: ids.length, agentsRunning: freshAgents(shown).reduce((n, p) => n + p.agents_running, 0), faces: faces(shown, 8),
        invitedBy: by?.display_name ? { name: by.display_name, avatar: by.avatar_url ?? null } : null,
      };
    },

    async createRoom({ name, kind = 'room', listed = false, people = [], inviteOnly = false }: { name?: unknown; kind?: string; listed?: boolean; people?: string[] | null; inviteOnly?: boolean }) {
      const s = state(cloud);
      const clean = String(name ?? '').trim();
      if (clean.length < 1 || clean.length > 40) refuse('a room name that empty or that long');
      if (!['room', 'group'].includes(kind)) refuse(`a ${kind}`);
      if (listed && kind !== 'room') refuse('list a group');
      if (listed && inviteOnly) refuse('list a room that takes only people its members invite');
      if (listed && !s.members.some((m) => m.personId === personId)) refuse('list a room without a team');
      if ((people ?? []).length > 11) refuse('a group of more than twelve');
      limit('rooms', [...s.rooms.values()].filter((r) => r.createdBy === personId && r.createdAt > now() - DAY).length, 10);
      for (const p of people ?? []) if (p !== personId && !sharesRoom(p)) refuse('add somebody you share no room with');
      const id = crypto.randomUUID();
      s.rooms.set(id, { id, name: clean, kind, teamId: null, listed: !!listed, inviteOnly: !!inviteOnly, createdBy: personId, createdAt: now() });
      s.roomMembers.push({ roomId: id, personId, role: 'owner', joinedAt: now() });
      for (const p of new Set(people ?? [])) if (p !== personId) s.roomMembers.push({ roomId: id, personId: p, role: 'member', joinedAt: now() });
      emit({ kind: 'membership', roomId: id });
      return id;
    },

    async renameRoom(r: string, name: unknown) {
      if (!ownsRoom(r) || room(r)?.teamId) refuse('rename a room you do not own');
      const clean = String(name ?? '').trim();
      if (clean.length < 1 || clean.length > 40) refuse('a room name that empty or that long');
      room(r)!.name = clean;
      emit({ kind: 'membership', roomId: r });
    },

    async leaveRoom(r: string) {
      dropMember(r, personId);
    },

    async removeRoomMember(r: string, p: string) {
      if (!ownsRoom(r)) refuse('remove somebody from a room you do not own');
      dropMember(r, p);
    },

    async inviteToRoom(r: string, email: unknown) {
      if (!inRoom(r)) refuse('invite to a room you are not in');
      if (room(r)?.kind === 'group') refuse('invite to a group by email');
      const clean = String(email).trim().toLowerCase();
      if (!clean.includes('@')) refuse('an invite to no email');
      const s = state(cloud);
      if (s.roomInvites.some((i) => i.roomId === r && i.email === clean)) return;
      limit('invites', s.roomInvites.filter((i) => i.invitedBy === personId && i.createdAt > now() - DAY).length, 50);
      s.roomInvites.push({ roomId: r, email: clean, invitedBy: personId, createdAt: now(), acceptedAt: null });
    },

    async roomInvitesSent(r: string) {
      if (!inRoom(r)) return [];
      return state(cloud).roomInvites.filter((i) => i.roomId === r && i.invitedBy === personId)
        .sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
        .map((i) => ({ email: i.email, at: i.createdAt, joined: !!i.acceptedAt }));
    },

    async pendingRoomInvites() {
      const email = confirmedEmail();
      if (!email) return [];
      const s = state(cloud);
      return s.roomInvites.filter((i) => i.email === email && !i.acceptedAt && !inRoom(i.roomId))
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((i) => ({ roomId: i.roomId, roomName: room(i.roomId)?.name ?? '', invitedBy: i.invitedBy, invitedByName: s.roomProfiles.get(i.invitedBy)?.display_name || null }));
    },

    async acceptRoomInvite(r: string) {
      const email = confirmedEmail();
      if (!email) refuse('join a room without a confirmed email');
      const s = state(cloud);
      const invite = s.roomInvites.find((i) => i.roomId === r && i.email === email && !i.acceptedAt);
      if (!invite) refuse('join a room that did not invite you');
      invite.acceptedAt = now();
      return join(r);
    },

    async agentboxRanks(ids: string[] | null | undefined) {
      const totals = new Map();
      for (const p of state(cloud).roomPresence.values()) {
        if (p.gone || !visible(p.person_id)) continue;
        totals.set(p.person_id, (totals.get(p.person_id) ?? 0) + Number(p.hours_total));
      }
      const out: Record<string, number> = {};
      for (const p of ids ?? []) {
        if (p !== personId && !(sharesRoom(p) && visible(p))) continue;
        const h = totals.get(p) ?? 0;
        out[p] = 1 + [...totals.values()].filter((x) => x > h).length;
      }
      return out;
    },

    subscribeRooms(onEvent: (event: RoomEvent) => void) {
      const hear = (e: MemoryRoomEvent) => {
        if (e.kind === 'message') { if (inRoom(e.message.roomId)) onEvent({ kind: 'message', message: copy(e.message) }); return; }
        if (e.kind === 'reaction') { if (inRoom(e.reaction.roomId)) onEvent({ kind: 'reaction', reaction: { ...e.reaction } }); return; }
        onEvent({ kind: e.kind });
      };
      cloud.events.on('rooms', hear);
      queueMicrotask(() => onEvent({ kind: 'subscribed' }));
      return () => cloud.events.off('rooms', hear);
    },
  };
}
