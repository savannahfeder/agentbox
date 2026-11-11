// ROOMS ON THIS MAC (w-3d0fa23ffb, docs/team/ROOMS-PLAN.md): the rooms I am in,
// each room's wall and chat, and the presence row this Mac publishes. Lives
// inside the team service (main/team/index.mts) and only runs while Rooms is
// switched on in Alpha features and someone is signed in.
import fs from 'node:fs';
import path from 'node:path';
import { wallCards, myPresence, displayNameOf, withoutHidden } from '../../shared/room-cards.mts';
import type { WallCard, TeamCardLike } from '../../shared/room-cards.mts';
import type { AgentHoursSummary } from '../../shared/agent-hours.mts';
import { groupFileRow, groupRow } from '../../shared/room-needs-you.mts';
import type { GroupRow } from '../../shared/room-needs-you.mts';
import { ROOM_FILE_NAME, FILE_EXISTS } from './rooms-shape.mts';
import { carryIntoRoom } from './carry-files.mts';
import type { FoundToSend } from './carry-files.mts';
import { readRoomMessage } from '../../shared/agent-voice.mts';
import { cleanMark } from '../../shared/artifact-marks.mts';
import { TEAM_LOOK, TEAM_LOOK_POSTED, TEAM_LOOK_TEMPLATE, newestTeamLook } from '../../shared/team-look.mts';
import { ROOM_MAX_BYTES, ROOM_PART_BYTES, partName, partList, partsOf, readPartList } from '../../shared/room-file-parts.mts';

/** A room as `roomOut` shapes it. */
export interface RoomRow {
  id: string;
  name: string;
  kind: string;
  teamId: string | null;
  listed: boolean;
  inviteOnly: boolean;
  role: string;
  members: number;
  createdAt: number;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  by: string | null;
  body: string;
  inReplyTo: string | null;
  mentions: string[];
  at: number;
  editedAt: number | null;
  deleted: boolean;
  reactions?: Record<string, (string | null)[]>;
}

/** A message the team marked as a decision or as the week's priorities. */
export interface RoomDecision {
  roomId: string;
  messageId: string;
  kind: string;
  project: string | null;
  body: string;
  saidBy: string | null;
  by: string | null;
  on: boolean;
  at: number;
}

/** A comment, reply, resolve or approval on a file in a room. */
export interface RoomFileMark {
  id: string;
  by: string | null;
  mark: object;
  at: number;
}

export interface RoomReaction {
  messageId: string;
  roomId: string;
  by: string | null;
  emoji: string;
  on: boolean;
  at: number;
}

/** A person's room card, in the columns the cloud keeps. */
export interface RoomProfile {
  person_id: string;
  display_name: string;
  avatar_url: string | null;
  headline: string | null;
  bio: string | null;
  show_working: string;
  show_agents: boolean;
  show_level: boolean;
  show_status: boolean;
  show_activity: boolean;
  invisible_until: string | null;
  status_text: string | null;
  status_until: string | null;
  updated_at: string;
}

export interface RoomPresenceRow {
  person_id: string;
  device: string;
  gone: boolean;
  agents_running: number;
  working_on: string | null;
  working_private: boolean;
  working_at: string | null;
  hours_total: number;
  hours_week: number;
  week_start: string | null;
  hours_today: number;
  day: string | null;
  streak_days: number;
  active_days: unknown[];
  hours_by_month: unknown[];
  activity: unknown[];
  updated_at: string;
}

/** Who is in a room, by the name the room knows them by. */
export interface RoomNameRow {
  person_id: string;
  name: string;
  avatar_url: string | null;
  has_card: boolean;
}

export interface RoomInviteRow {
  roomId: string;
  roomName: string;
  invitedBy: string | null;
  invitedByName: string | null;
}

export type RoomEvent =
  | { kind: 'message'; message: RoomMessage; roomId?: string }
  | { kind: 'reaction'; reaction: RoomReaction }
  | { kind: 'subscribed' | 'membership' | 'profile' | 'presence' | 'decision' | 'fileMark' };

/** The calls the rooms code makes of the cloud; the two backends both answer them. */
export interface RoomsBackend {
  myRooms(): Promise<RoomRow[]>;
  roomPeople(roomId: string): Promise<string[]>;
  roomNames?(roomId: string): Promise<RoomNameRow[] | null>;
  roomProfiles(ids: string[]): Promise<RoomProfile[]>;
  roomPresence(ids: string[]): Promise<RoomPresenceRow[]>;
  myRoomProfile(): Promise<RoomProfile | null>;
  saveRoomProfile(fields: Record<string, unknown>): Promise<RoomProfile | null>;
  putPresence(device: string, fields: Record<string, unknown>): Promise<void>;
  roomMessages(roomId: string, options?: { before?: number | null; limit?: number }): Promise<RoomMessage[]>;
  roomMentions(options?: { limit?: number }): Promise<RoomMessage[]>;
  sendRoomMessage(roomId: string, message: { body: string; inReplyTo: string | null; mentions: string[] }): Promise<RoomMessage>;
  editRoomMessage(messageId: string, message: { body: string; mentions: string[] }): Promise<RoomMessage>;
  deleteRoomMessage(messageId: string): Promise<void>;
  roomReactions(roomId: string): Promise<RoomReaction[]>;
  roomDecisions(roomId: string): Promise<RoomDecision[]>;
  markRoomDecision(roomId: string, mark: unknown): Promise<void>;
  roomFileMarks?(roomId: string): Promise<RoomFileMark[]>;
  markRoomFile(roomId: string, mark: { id: string; mark: object }): Promise<void>;
  reactRoomMessage(messageId: string, emoji: string, on: boolean): Promise<void>;
  putRoomFile(roomId: string, name: string, data: string): Promise<string | void>;
  roomFile(roomId: string, name: string): Promise<string | null>;
  roomReads(): Promise<{ roomId: string; readAt: number }[]>;
  markRoomRead(roomId: string, at: number): Promise<void>;
  markRoomUnread(roomId: string, at: number): Promise<void>;
  roomLink(roomId: string): Promise<string>;
  revokeRoomLink(roomId: string): Promise<string>;
  joinRoomByLink(token: string): Promise<string>;
  joinListedRoom(roomId: string): Promise<string>;
  listedRooms(): Promise<unknown[]>;
  roomPreview(token: string): Promise<unknown>;
  createRoom(room: { name: string; kind: string; listed: boolean; inviteOnly: boolean; people: string[] }): Promise<string>;
  renameRoom(roomId: string, name: string): Promise<void>;
  leaveRoom(roomId: string): Promise<void>;
  removeRoomMember(roomId: string, personId: string): Promise<void>;
  inviteToRoom(roomId: string, email: string): Promise<void>;
  roomInvitesSent(roomId: string): Promise<unknown[]>;
  pendingRoomInvites(): Promise<RoomInviteRow[]>;
  acceptRoomInvite(roomId: string): Promise<string>;
  agentboxRanks(ids: string[]): Promise<Record<string, number>>;
  subscribeRooms(onEvent: (event: RoomEvent) => void): () => void;
}

/** This Mac's pins, mutes and unread marks for one person. */
export interface RoomPrefs {
  pinned: string[];
  muted: string[];
  markedUnread: string[];
  autoPinned: boolean;
  doneAt: Record<string, number>;
}

/** A room as the window draws it. */
export interface RoomView extends RoomRow {
  pinned: boolean;
  muted: boolean;
  readAt: number;
  markedUnread: boolean;
  unread: number;
  lastAt: number;
  agents: number;
  wall: WallCard[];
  people: { id: string; name: string; avatarUrl: string | null }[] | null;
}

export type { WallCard };

export interface RoomsState {
  on: boolean;
  ready: boolean;
  rooms: RoomView[];
  messages: Record<string, RoomMessage[]>;
  me: RoomProfile | null;
  ranks: Record<string, number>;
  invites: RoomInviteRow[];
  mentions: GroupRow[];
  decisions: Record<string, RoomDecision[]>;
  fileMarks: Record<string, RoomFileMark[]>;
  sending: Record<string, { done: number; total: number }>;
  error: string | null;
  rawRooms?: RoomRow[];
}

/** What this Mac knows to say about its own work, for the presence row. */
export interface PresenceFacts {
  running?: { itemId: string; product: string; startedAt?: number }[];
  items?: { id: string; label?: string; title?: string; visibility?: string }[];
  products?: { slug?: string; personal?: boolean; seenBy?: string; seenByPeople?: string[] }[];
  summary?: AgentHoursSummary | null;
}

export interface RoomsOptions {
  backend: () => RoomsBackend | null;
  me: () => { id: string; name?: string; avatarUrl?: string | null; status?: { text?: string | null; until?: number | string | null } | null } | null | undefined;
  team: () => { people?: { id: string; name?: string }[]; cards?: TeamCardLike[]; team?: unknown } | null | undefined;
  enabled: () => boolean;
  device: () => string;
  presenceFacts: () => PresenceFacts | null | undefined;
  prefsFile: string;
  /** What a name in a message means on this computer (./carry-files.mts). */
  findFile?: ((ref: string, how?: { meant?: boolean }) => FoundToSend | null | Promise<FoundToSend | null>) | null;
  /** Writes the team's decisions where agents read (./decisions-doc.mts). */
  decisionDocs?: ((args: { teamName: string; rows: RoomDecision[]; nameOf: (id: string | null) => string }) => unknown) | null;
  /** Writes the Team look where agents read (./team-look-doc.mts). */
  teamLookDocs?: ((args: { text: string }) => unknown) | null;
  /** Where a room's file is put back together whole, inside a folder the window may draw from. */
  filesDir?: string | null;
  now?: () => number;
  log?: (line: string) => void;
  onChange?: () => void;
  timers?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
}

const MESSAGES_HELD = 200;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Played voice notes and opened attachments, so a second play is not a second
// download; bounded by count and by size, since one file can be 10 MB.
const FILES_HELD = 40;
const FILE_CHARS_HELD = 64_000_000;
const HEARTBEAT_MS = 5 * 60_000;
const SETTLE_MS = 400;

// Pins, mutes, rooms marked unread, the first-room pin and each group's Mark
// done are this Mac's, kept per person.
export function roomPrefsFile(storeRoot: string) {
  return path.join(storeRoot, '.rooms.json');
}

const PREFS: RoomPrefs = { pinned: [], muted: [], markedUnread: [], autoPinned: false, doneAt: {} };

function prefsStore(file: string) {
  const read = (): Record<string, Partial<RoomPrefs>> => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) ?? {}; } catch { return {}; } };
  return {
    get: (who: string | null): RoomPrefs => ({ ...PREFS, ...(read()[who as string] ?? {}) }),
    set: (who: string | null, patch: Partial<RoomPrefs>) => {
      const all = read();
      all[who as string] = { ...PREFS, ...(all[who as string] ?? {}), ...patch };
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(all, null, 2)); } catch { /* a pin that is not kept is not worth failing over */ }
      return all[who as string];
    },
  };
}

const EMPTY: RoomsState = { on: false, ready: false, rooms: [], messages: {}, me: null, ranks: {}, invites: [], mentions: [], decisions: {}, fileMarks: {}, sending: {}, error: null };

const reactionKey = (x: { messageId: string; by: string | null; emoji: string }) => `${x.messageId}\n${x.by}\n${x.emoji}`;

// Only reactions that are on, in the order they were made. Built from Maps so
// an emoji spelled "__proto__" is an ordinary key.
function withReactions(held: RoomMessage[], rows: Map<string, RoomReaction> | undefined) {
  const on = [...(rows?.values() ?? [])].filter((x) => x.on).sort((a, b) => a.at - b.at);
  const byMessage = new Map<string, Map<string, (string | null)[]>>();
  for (const x of on) {
    const emojis = byMessage.get(x.messageId) ?? new Map<string, (string | null)[]>();
    emojis.set(x.emoji, [...(emojis.get(x.emoji) ?? []), x.by]);
    byMessage.set(x.messageId, emojis);
  }
  return held.map((m) => ({ ...m, reactions: m.deleted ? {} : Object.fromEntries(byMessage.get(m.id) ?? []) }));
}

// Padding taken off, so a file of exactly 10 MB is not refused.
const bytesOf = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

export function createRooms({
  backend, // () => the signed-in backend, or null
  me, // () => { id, name } of who is signed in, or null
  team, // () => { people, cards } from the team service
  enabled, // () => whether Rooms is switched on
  device, // () => this Mac's 12-hex id
  presenceFacts, // () => { running, items, products, summary }
  prefsFile,
  now = Date.now,
  log = () => {},
  findFile = null, // (ref) => what a name in a message means on this computer (./carry-files.mts)
  decisionDocs = null, // ({ teamName, rows, nameOf }) => writes the team's decisions where agents read (./decisions-doc.mts)
  teamLookDocs = null, // ({ text }) => writes the Team look where agents read (./team-look-doc.mts)
  filesDir = null, // where a room's file is put back together whole, inside a folder the window may draw from
  onChange = () => {},
  timers = { setTimeout, clearTimeout },
}: RoomsOptions) {
  const prefs = prefsStore(prefsFile);
  let state: RoomsState = { ...EMPTY };
  let people = new Map<string, string[]>(); // roomId -> [personId]
  let names = new Map<string, RoomNameRow[] | null>(); // roomId -> room_names rows, or null on a cloud without them
  let profiles = new Map<string, RoomProfile>(); // personId -> row
  let presence: RoomPresenceRow[] = []; // rows
  let messages = new Map<string, RoomMessage[]>(); // roomId -> [message], oldest first
  let reads = new Map<string, number>(); // roomId -> ms
  let reactions = new Map<string, Map<string, RoomReaction>>(); // roomId -> Map(reactionKey -> reaction), off ones too
  let decisions = new Map<string, RoomDecision[]>(); // roomId -> [decision], taken-back ones too
  let files = new Map<string, string>(); // `${roomId}/${name}` -> base64, oldest first
  let fileMarks = new Map<string, RoomFileMark[]>(); // roomId -> [{ id, by, mark, at }]
  const sending = new Map<string, { done: number; total: number }>(); // `${roomId}/${name}` -> { done, total } parts
  let mentioned: RoomMessage[] = []; // my newest mentions, which may be older than the messages held
  let unsubscribe: (() => void) | null = null;
  let started: RoomsBackend | null = null; // the backend rooms were started on
  let setUp = false; // my profile made, Coworking joined if I have nowhere else, realtime on
  let lastSent: string | null = null;
  let lastSentAt = 0;
  let refreshing: Promise<void> | null = null;
  let again = false;
  let gen = 0; // bumped by every change made here, see refresh
  let settle: ReturnType<typeof setTimeout> | null = null;

  const meId = () => me()?.id ?? null;

  function build() {
    if (!started) { state = { ...EMPTY, on: !!enabled() }; return; }
    const who = meId();
    const t = team() ?? {};
    const teammates = (t.people ?? []).map((p) => p.id).filter((id) => id !== who);
    const p = prefs.get(who);
    const pinned = new Set(p.pinned);
    const muted = new Set(p.muted);
    const marked = new Set(p.markedUnread);
    const at = now();
    const mentions: GroupRow[] = [];
    const mine = ownWork();
    const shown = new Map<string, ReturnType<typeof withReactions>>();
    const rooms = (state.rawRooms ?? []).map((r): RoomView => {
      const held = messages.get(r.id) ?? [];
      shown.set(r.id, withReactions(held, reactions.get(r.id)));
      const readAt = reads.get(r.id) ?? 0;
      const unreadMsgs = held.filter((m) => m.at > readAt && m.by !== who && !m.deleted);
      const called = names.get(r.id) ?? null;
      // Everyone in the room by name, invisible or with no card, for the chat.
      const everyone = called?.map((n) => ({ id: n.person_id, name: n.has_card ? n.name : displayNameOf(n.name), avatarUrl: n.avatar_url ?? null })) ?? null;
      const nameOf = (id: string | null) => profiles.get(id as string)?.display_name || everyone?.find((p) => p.id === id)?.name || '';
      const row = groupRow({
        roomId: r.id, roomName: r.name, messages: held, mentioned: mentioned.filter((m) => m.roomId === r.id), me: who, readAt,
        people: [...(called?.map((n) => ({ id: n.person_id, name: n.name })) ?? []), { id: who as string, name: me()?.name ?? '' }, { id: who as string, name: profiles.get(who as string)?.display_name ?? '' }],
        doneAt: p.doneAt[r.id] ?? 0, nameOf,
        answeredAt: Math.max(0, ...(fileMarks.get(r.id) ?? []).filter((m) => m.by === who).map((m) => m.at)),
      });
      if (row) mentions.push(row);
      const fileRow = groupFileRow({ roomId: r.id, roomName: r.name, marks: fileMarks.get(r.id) ?? [], me: who, myName: me()?.name ?? null, doneAt: p.doneAt[r.id] ?? 0, nameOf });
      if (fileRow) mentions.push(fileRow);
      const wall = wallCards({ members: people.get(r.id) ?? [], profiles: [...profiles.values()], presence, teammates, teamCards: t.cards ?? [], meId: who, now: at, mine, names: called, listed: !!r.listed }) as WallCard[];
      return {
        ...r,
        pinned: pinned.has(r.id),
        muted: muted.has(r.id),
        readAt,
        markedUnread: marked.has(r.id),
        // A room marked unread reads as unread until it is read, even with
        // nothing new from anyone else in it.
        unread: Math.max(unreadMsgs.length, marked.has(r.id) ? 1 : 0),
        lastAt: held.at(-1)?.at ?? r.createdAt,
        agents: wall.reduce((n, c) => n + (c.agents ?? 0), 0),
        wall,
        people: everyone,
      };
    });
    state = {
      ...state,
      on: true,
      rooms,
      messages: Object.fromEntries(rooms.map((r) => [r.id, shown.get(r.id)!])),
      // A deleted message's words are gone from the chat, so they go from the list.
      decisions: Object.fromEntries(rooms.map((r) => {
        const gone = new Set((messages.get(r.id) ?? []).filter((m) => m.deleted).map((m) => m.id));
        return [r.id, (decisions.get(r.id) ?? []).filter((d) => !gone.has(d.messageId))];
      })),
      mentions: mentions.sort((a, b) => b.at - a.at),
      fileMarks: Object.fromEntries(rooms.map((r) => [r.id, fileMarks.get(r.id) ?? []])),
      sending: Object.fromEntries(sending),
    };
  }

  // Agents read the team's decisions as a document in each project.
  function writeDocs() {
    const room = (state.rooms ?? []).find((r) => r.teamId);
    if (!decisionDocs || !room) return;
    const nameOf = (id: string | null) => room.people?.find((p) => p.id === id)?.name || (team()?.people ?? []).find((p) => p.id === id)?.name || 'Someone';
    try { decisionDocs({ teamName: room.name, rows: state.decisions?.[room.id] ?? [], nameOf }); } catch (err) { log(`rooms: decisions document: ${(err as Error).message}`); }
  }

  // The Team look's newest version, as a document in each project. The first
  // version has a fixed name, so of every copy that finds none, one makes it.
  let lookWritten: string | null = null;
  let lookAsked = false;
  async function keepTeamLook() {
    const room = (state.rooms ?? []).find((r) => r.teamId);
    const b = backend();
    if (!teamLookDocs || !room || !b) return;
    const name = newestTeamLook(messages.get(room.id) ?? []) ?? TEAM_LOOK;
    if (name === lookWritten) return;
    let text = await api.fileText(room.id, name).catch(() => null);
    if (text == null && name === TEAM_LOOK && !lookAsked) {
      lookAsked = true;
      try {
        await b.putRoomFile(room.id, TEAM_LOOK, Buffer.from(TEAM_LOOK_TEMPLATE).toString('base64'));
        await api.send(room.id, TEAM_LOOK_POSTED);
        text = TEAM_LOOK_TEMPLATE;
      } catch (err) {
        if ((err as { code?: string })?.code !== FILE_EXISTS) throw err;
        text = await api.fileText(room.id, name).catch(() => null);
      }
    }
    if (text == null) return;
    teamLookDocs({ text });
    lookWritten = name;
  }

  const changed = () => { build(); onChange(); };

  // The thread this Mac's newest agent is on, for my own card only.
  function ownWork() {
    let f: PresenceFacts = {};
    try { f = presenceFacts() ?? {}; } catch { return null; }
    const lead = [...(f.running ?? [])].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
    if (!lead) return { workingOn: null, agents: 0 };
    const item = (f.items ?? []).find((i) => i.id === lead.itemId);
    return { workingOn: (String(item?.label ?? '').trim() || String(item?.title ?? '')).slice(0, 64) || null, agents: f.running!.length };
  }
  const local = () => { gen += 1; };

  // One pass at a time; a call during a pass asks for another, and resolves
  // when the last one has run. A pass that overlapped a change made here
  // (a message heard, a profile saved) is thrown away and run again, so what
  // was read before the change never lands on top of it.
  function refresh() {
    again = true;
    refreshing ??= (async () => {
      while (again) { again = false; await refreshOnce(); }
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function refreshOnce() {
    const b = backend();
    if (!b || !started) return;
    const g = gen;
    try {
      const rooms = await b.myRooms();
      const ids = new Map<string, string[]>();
      const named = new Map<string, RoomNameRow[] | null>();
      await Promise.all(rooms.map(async (r) => {
        const [who, called] = await Promise.all([b.roomPeople(r.id), b.roomNames ? b.roomNames(r.id).catch(() => null) : null]);
        ids.set(r.id, who);
        named.set(r.id, called);
      }));
      const everyone = [...new Set([meId(), ...[...ids.values()].flat()])].filter(Boolean) as string[];
      const [profileRows, presenceRows, readRows, mine, invites, ranks, mentionRows] = await Promise.all([
        b.roomProfiles(everyone), b.roomPresence(everyone), b.roomReads(), b.myRoomProfile(),
        b.pendingRoomInvites().catch(() => []), b.agentboxRanks(everyone).catch(() => ({})),
        b.roomMentions({ limit: 50 }).catch(() => []),
      ]);
      const held = new Map<string, RoomMessage[]>();
      const reacted = new Map<string, Map<string, RoomReaction>>();
      const marked = new Map<string, RoomDecision[]>();
      const onFiles = new Map<string, RoomFileMark[]>();
      await Promise.all(rooms.map(async (r) => {
        const [fresh, rows, decided, said] = await Promise.all([
          b.roomMessages(r.id, { limit: MESSAGES_HELD }), b.roomReactions(r.id), b.roomDecisions(r.id).catch(() => []),
          b.roomFileMarks ? b.roomFileMarks(r.id).catch(() => []) : [],
        ]);
        held.set(r.id, merge(messages.get(r.id), fresh));
        reacted.set(r.id, new Map(rows.map((x): [string, RoomReaction] => [reactionKey(x), x])));
        marked.set(r.id, decided);
        onFiles.set(r.id, said);
      }));
      if (backend() !== b || started !== b) return;
      if (g !== gen) { again = true; return; }
      people = ids;
      names = named;
      profiles = new Map(profileRows.map((row): [string, RoomProfile] => [row.person_id, row]));
      presence = presenceRows;
      messages = held;
      reactions = reacted;
      decisions = marked;
      fileMarks = onFiles;
      reads = new Map(readRows.map((r): [string, number] => [r.roomId, r.readAt]));
      mentioned = mentionRows;
      autoPin(rooms);
      state = { ...state, ready: true, rawRooms: rooms, me: mine, invites, ranks, error: null };
    } catch (err) {
      state = { ...state, error: String((err as Error)?.message ?? err) };
      log(`rooms: ${state.error}`);
    }
    changed();
    writeDocs();
    keepTeamLook().catch((err) => log(`rooms: team look: ${err.message}`));
  }

  function merge(old: RoomMessage[] = [], fresh: RoomMessage[] = []) {
    const byId = new Map(old.map((m): [string, RoomMessage] => [m.id, m]));
    for (const m of fresh) byId.set(m.id, readRoomMessage(m));
    return [...byId.values()].sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id))).slice(-MESSAGES_HELD);
  }

  // The first room I am ever in is pinned for me, once.
  function autoPin(rooms: RoomRow[]) {
    const who = meId();
    const p = prefs.get(who);
    if (p.autoPinned || !rooms.length) return;
    const first = rooms.find((r) => r.teamId) ?? rooms[0];
    prefs.set(who, { autoPinned: true, pinned: [...new Set([...p.pinned, first.id])] });
  }

  function later() {
    if (settle) return;
    settle = timers.setTimeout(() => { settle = null; refresh(); }, SETTLE_MS);
    settle?.unref?.();
  }

  // An edit or a delete of a message not held is left for when it is read.
  function holdMessage(m: RoomMessage) {
    const held = messages.get(m.roomId) ?? [];
    if ((m.editedAt == null && !m.deleted) || held.some((x) => x.id === m.id)) messages.set(m.roomId, merge(held, [m]));
    mentioned = mentioned.map((x) => (x.id === m.id ? m : x));
    if (m.deleted) dropReactions(m.roomId, m.id);
  }

  function holdReaction(x: RoomReaction) {
    const held = reactions.get(x.roomId) ?? new Map<string, RoomReaction>();
    held.set(reactionKey(x), x);
    reactions.set(x.roomId, held);
  }

  function dropReactions(roomId: string, messageId: string) {
    const held = reactions.get(roomId);
    if (held) for (const [k, x] of held) if (x.messageId === messageId) held.delete(k);
  }

  function hear(e: RoomEvent) {
    if (e.kind === 'message' || e.kind === 'reaction') {
      const roomId = e.kind === 'message' ? e.message.roomId : e.reaction.roomId;
      if (!messages.has(roomId)) { later(); return; }
      local();
      if (e.kind === 'message') holdMessage(e.message);
      else holdReaction(e.reaction);
      changed();
      return;
    }
    later();
  }

  function keepFile(key: string, data: string) {
    files.delete(key);
    files.set(key, data);
    let total = 0;
    for (const d of files.values()) total += d.length;
    for (const [k, d] of files) {
      if (files.size <= FILES_HELD && total <= FILE_CHARS_HELD) break;
      files.delete(k);
      total -= d.length;
    }
  }

  // What this Mac sends, when it differs from what it last sent, and every
  // few minutes regardless so others do not read it as gone quiet.
  async function publish({ force = false }: { force?: boolean } = {}) {
    const b = backend();
    if (!b || !started) return false;
    const facts = presenceFacts() ?? {};
    const showWorking = state.me?.show_working ?? 'everyone';
    const row = withoutHidden(myPresence({ ...facts, now: now(), showWorking }), state.me);
    const key = JSON.stringify(row);
    if (!force && key === lastSent && now() - lastSentAt < HEARTBEAT_MS) return false;
    await b.putPresence(device(), { ...row, gone: false });
    lastSent = key;
    lastSentAt = now();
    return true;
  }

  async function ensureProfile(b: RoomsBackend) {
    const mine = await b.myRoomProfile();
    if (mine) return mine;
    // The cloud keeps an address of up to 500 characters, not a picture's bytes.
    const face = me()?.avatarUrl ?? null;
    const avatar = typeof face === 'string' && /^https?:\/\//.test(face) && face.length <= 500 ? face : null;
    // Thread names reach strangers only once their owner turns that on. Said
    // here as well as in the cloud's default, for a cloud from before it changed.
    return b.saveRoomProfile({ display_name: displayNameOf(me()?.name ?? '') || 'Someone', avatar_url: avatar, show_working: 'team' });
  }

  // Tried on every pass until it works: a cloud without the rooms tables yet,
  // or a dropped network, must not leave me nameless and deaf for the session.
  async function setUpOnce(b: RoomsBackend) {
    try {
      const mine = await ensureProfile(b);
      state = { ...state, me: mine };
      unsubscribe ??= b.subscribeRooms(hear);
      setUp = true;
      state = { ...state, error: null };
    } catch (err) {
      state = { ...state, error: String((err as Error)?.message ?? err) };
      log(`rooms: starting: ${state.error}`);
    }
  }

  async function start() {
    const b = backend();
    if (!b || !enabled() || !meId()) return;
    if (started === b) return;
    await stop();
    started = b;
    state = { ...EMPTY, on: true };
    await setUpOnce(b);
    await refresh();
    await publish({ force: true }).catch((err) => log(`rooms: presence: ${err.message}`));
  }

  // Rooms switched off, or signed out: this Mac says it has gone, and stops.
  async function stop() {
    const b = started;
    unsubscribe?.();
    unsubscribe = null;
    if (settle) timers.clearTimeout(settle);
    settle = null;
    started = null;
    setUp = false;
    lastSent = null;
    people = new Map(); names = new Map(); profiles = new Map(); presence = []; messages = new Map(); reads = new Map(); mentioned = [];
    reactions = new Map(); decisions = new Map(); files = new Map(); fileMarks = new Map(); sending.clear();
    state = { ...EMPTY, on: !!enabled() };
    if (b) await b.putPresence(device(), { gone: true, agents_running: 0, working_on: null, working_private: false, activity: [] }).catch(() => {});
    onChange();
  }

  // Called on every pass of the team's sync loop.
  async function tick() {
    const want = !!enabled() && !!backend() && !!meId();
    if (want && started !== backend()) return start();
    if (!want && started) return stop();
    if (!want) return;
    if (!setUp) { await setUpOnce(started!); if (setUp) await refresh(); }
    await syncName().catch((err) => log(`rooms: name: ${err.message}`));
    await syncStatus().catch((err) => log(`rooms: status: ${err.message}`));
    await publish().catch((err) => log(`rooms: presence: ${err.message}`));
    await syncInvites().catch((err) => log(`rooms: invites: ${err.message}`));
  }

  // An invitation makes no event a running copy hears, so each pass asks.
  async function syncInvites() {
    const invites = await backend()!.pendingRoomInvites();
    if (JSON.stringify(invites) === JSON.stringify(state.invites ?? [])) return;
    local();
    state = { ...state, invites };
    changed();
  }

  // A card made before my name was known reads "Someone" until it is.
  async function syncName() {
    const mine = state.me;
    const name = displayNameOf(me()?.name ?? '');
    if (!mine || !name || (mine.display_name && mine.display_name !== 'Someone')) return;
    const saved = await backend()!.saveRoomProfile({ display_name: name });
    local();
    state = { ...state, me: saved };
    changed();
  }

  // The line I wrote for my team (the account menu) is my room card's status.
  async function syncStatus() {
    const mine = state.me;
    if (!mine) return;
    const s = mine.show_status === false ? null : me()?.status ?? null;
    const text = s?.text ?? null;
    const until = text && s?.until ? new Date(s.until).toISOString() : null;
    if ((mine.status_text ?? null) === text && (mine.status_until ? new Date(mine.status_until).toISOString() : null) === until) return;
    const saved = await backend()!.saveRoomProfile({ status_text: text, status_until: until });
    local();
    state = { ...state, me: saved };
    changed();
  }

  const need = () => { const b = backend(); if (!b || !started) throw new Error('turn on Rooms and sign in first'); return b; };
  const after = async <T,>(p: Promise<T>) => { const out = await p; await refresh(); return out; };

  const api = {
    state: () => { const { rawRooms, ...shown } = state; return shown; },
    start, stop, tick, refresh, publish,

    async send(roomId: string, body: unknown, { inReplyTo = null, mentions = [] }: { inReplyTo?: string | null; mentions?: string[] } = {}) {
      const b = need();
      const words = await carryIntoRoom(String(body ?? '').trim(), {
        find: findFile,
        put: async (name: string, data: string) => { try { await b.putRoomFile(roomId, name, data); } catch (err) { if ((err as { code?: string })?.code !== FILE_EXISTS) throw err; } },
        log: (line = '') => log(line),
      });
      const m = await b.sendRoomMessage(roomId, { body: words, inReplyTo, mentions });
      local();
      messages.set(roomId, merge(messages.get(roomId), [m]));
      reads.set(roomId, Math.max(reads.get(roomId) ?? 0, m.at));
      changed();
      keepTeamLook().catch((err) => log(`rooms: team look: ${err.message}`));
      return m;
    },

    async markRead(roomId: string) {
      const b = need();
      const who = meId();
      const p = prefs.get(who);
      const marked = p.markedUnread.includes(roomId);
      const last = (messages.get(roomId) ?? []).at(-1)?.at;
      const behind = !!last && (reads.get(roomId) ?? 0) < last;
      if (!behind && !marked) return;
      local();
      if (marked) prefs.set(who, { markedUnread: p.markedUnread.filter((x) => x !== roomId) });
      if (behind) reads.set(roomId, last);
      changed();
      if (behind) await b.markRoomRead(roomId, last);
    },

    // Done with what the group has said so far, so what lands after is new
    // whatever this Mac's clock says.
    async markDone(roomId: string) {
      const who = meId();
      const p = prefs.get(who);
      const newest = Math.max(0, ...[...(messages.get(roomId) ?? []), ...mentioned.filter((m) => m.roomId === roomId), ...(fileMarks.get(roomId) ?? [])].map((m) => m.at));
      local();
      prefs.set(who, { doneAt: { ...p.doneAt, [roomId]: Math.max(p.doneAt[roomId] ?? 0, newest) } });
      changed();
      await this.markRead(roomId);
    },

    // `at` is the time of the first message that should read as unread.
    async markUnread(roomId: string, at: unknown) {
      const b = need();
      const from = Number(at);
      if (!Number.isFinite(from) || from <= 0) throw new Error('Pick the message to mark unread from.');
      const who = meId();
      const p = prefs.get(who);
      local();
      reads.set(roomId, from - 1);
      prefs.set(who, { markedUnread: [...new Set([...p.markedUnread, roomId])] });
      changed();
      await b.markRoomUnread(roomId, from - 1);
    },

    async react(roomId: string, messageId: string, emoji: string, on = true) {
      const b = need();
      await b.reactRoomMessage(messageId, emoji, !!on);
      const key = reactionKey({ messageId, by: meId(), emoji });
      if (!on && !reactions.get(roomId)?.has(key)) return;
      local();
      holdReaction({ messageId, roomId, by: meId(), emoji, on: !!on, at: now() });
      changed();
    },

    decide: (roomId: string, mark: unknown) => after(need().markRoomDecision(roomId, mark)),

    async edit(roomId: string, messageId: string, body: unknown, { mentions = [] }: { mentions?: string[] } = {}) {
      const b = need();
      const m = await b.editRoomMessage(messageId, { body: String(body ?? '').trim(), mentions });
      local();
      holdMessage({ ...m, roomId });
      changed();
      return m;
    },

    async deleteMessage(roomId: string, messageId: string) {
      const b = need();
      await b.deleteRoomMessage(messageId);
      const was = messages.get(roomId)?.find((m) => m.id === messageId);
      local();
      if (was) holdMessage({ ...was, body: '', mentions: [], deleted: true });
      mentioned = mentioned.filter((m) => m.id !== messageId);
      dropReactions(roomId, messageId);
      changed();
    },

    async putFile(roomId: string, { name, dataBase64 }: { name?: unknown; dataBase64?: unknown } = {}) {
      const b = need();
      const n = String(name ?? '');
      if (!ROOM_FILE_NAME.test(n)) throw new Error(`A room cannot keep a file named “${n}”: a name starts with a letter or number and has only letters, numbers, dots, dashes and underscores, up to 160.`);
      const data = String(dataBase64 ?? '');
      if (bytesOf(data) > MAX_FILE_BYTES) throw new Error('That file is over 10 MB, the most a room takes.');
      try {
        await b.putRoomFile(roomId, n, data);
        keepFile(`${roomId}/${n}`, data);
      } catch (err) {
        if ((err as { code?: string })?.code !== FILE_EXISTS) throw err;
      }
      return n;
    },

    async file(roomId: string, name: string) {
      const b = need();
      const key = `${roomId}/${name}`;
      if (files.has(key)) {
        const data = files.get(key)!;
        keepFile(key, data);
        return data;
      }
      if (!ROOM_FILE_NAME.test(String(name ?? ''))) return null;
      const data = await b.roomFile(roomId, String(name));
      const list = readPartList(data);
      if (list) return fs.readFileSync((await this.fileOnDisk(roomId, name))!).toString('base64');
      if (data != null) keepFile(key, data);
      return data;
    },

    // THE FILE IS READ HERE, NOT IN THE WINDOW: the window could only read
    // pictures and films through its picture address, and whole into memory.
    async putFileFrom(roomId: string, { name, srcPath }: { name?: unknown; srcPath?: unknown } = {}) {
      const b = need();
      const n = String(name ?? '');
      if (!ROOM_FILE_NAME.test(n) || n.length > 150) throw new Error(`A room cannot keep a file named “${n}”.`);
      const src = String(srcPath ?? '');
      if (!path.isAbsolute(src)) throw new Error(`${n} could not be read`);
      const { size } = await fs.promises.stat(src).catch(() => { throw new Error(`${path.basename(src)} could not be read`); });
      const count = partsOf(size);
      if (!count) throw new Error(`${path.basename(src)} is over the ${Math.round(ROOM_MAX_BYTES / 1024 / 1024)} MB a message can send.`);
      if (count === 1) return this.putFile(roomId, { name: n, dataBase64: (await fs.promises.readFile(src)).toString('base64') });
      const key = `${roomId}/${n}`;
      const handle = await fs.promises.open(src, 'r');
      try {
        for (let i = 1; i <= count; i += 1) {
          sending.set(key, { done: i - 1, total: count });
          changed();
          const chunk = Buffer.alloc(Math.min(ROOM_PART_BYTES, size - (i - 1) * ROOM_PART_BYTES));
          await handle.read(chunk, 0, chunk.length, (i - 1) * ROOM_PART_BYTES);
          try { await b.putRoomFile(roomId, partName(n, i), chunk.toString('base64')); } catch (err) { if ((err as { code?: string })?.code !== FILE_EXISTS) throw err; }
        }
        // The list goes last, so a file that reads as whole is whole.
        try { await b.putRoomFile(roomId, n, partList(count, size)); } catch (err) { if ((err as { code?: string })?.code !== FILE_EXISTS) throw err; }
      } finally {
        await handle.close();
        sending.delete(key);
        changed();
      }
      return n;
    },

    /** Where the whole file sits on this Mac, put back together from its parts if it went in parts. */
    fileIfKept(roomId: string, name: unknown) {
      const n = String(name ?? '');
      if (!filesDir || !ROOM_FILE_NAME.test(n) || !/^[\w-]+$/.test(String(roomId))) return null;
      const there = path.join(filesDir, String(roomId), n);
      return fs.existsSync(there) ? there : null;
    },

    async fileOnDisk(roomId: string, name: unknown): Promise<string | null> {
      const b = need();
      const n = String(name ?? '');
      if (!filesDir || !ROOM_FILE_NAME.test(n) || !/^[\w-]+$/.test(String(roomId))) return null;
      const there = path.join(filesDir, String(roomId), n);
      if (fs.existsSync(there)) return there;
      const data = files.get(`${roomId}/${n}`) ?? await b.roomFile(roomId, n);
      if (data == null) return null;
      fs.mkdirSync(path.dirname(there), { recursive: true });
      const list = readPartList(data);
      const going = `${there}.${process.pid}.part`;
      if (!list) {
        fs.writeFileSync(going, Buffer.from(data, 'base64'));
      } else {
        fs.writeFileSync(going, '');
        for (let i = 1; i <= list.parts; i += 1) {
          const part = await b.roomFile(roomId, partName(n, i));
          if (part == null) { fs.rmSync(going, { force: true }); throw new Error(`Part ${i} of ${n} is not in the room yet.`); }
          fs.appendFileSync(going, Buffer.from(part, 'base64'));
        }
      }
      fs.renameSync(going, there);
      return there;
    },

    async fileText(roomId: string, name: unknown): Promise<string | null> {
      const there = await this.fileOnDisk(roomId, name);
      return there ? fs.readFileSync(there, 'utf8') : null;
    },

    // A comment, reply, resolve or approval on a file in the group, as a thread keeps them.
    async markFile(roomId: string, mark: unknown) {
      const b = need();
      const clean = cleanMark(mark);
      if (!clean) throw new Error('That comment could not be read.');
      const id = `m${now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await b.markRoomFile(roomId, { id, mark: clean });
      local();
      fileMarks.set(roomId, [...(fileMarks.get(roomId) ?? []), { id, by: meId(), mark: clean, at: now() }]);
      changed();
      return id;
    },

    async older(roomId: string) {
      const b = need();
      const held = messages.get(roomId) ?? [];
      const got = await b.roomMessages(roomId, { before: held[0]?.at ?? now(), limit: 100 });
      local();
      const all = new Map([...got, ...held].map((m) => [m.id, m]));
      messages.set(roomId, [...all.values()].sort((a, b2) => a.at - b2.at));
      changed();
      return got.length;
    },

    // My card: what it says and who sees what.
    async saveProfile(fields: Record<string, unknown> = {}) {
      const b = need();
      const patch = { ...fields };
      if ('fullName' in patch) {
        patch.display_name = displayNameOf(me()?.name ?? '', { full: !!patch.fullName }) || state.me?.display_name || 'Someone';
        delete patch.fullName;
      }
      const saved = await b.saveRoomProfile(patch);
      local();
      state = { ...state, me: saved };
      // My own card is built from `profiles`, which otherwise waits for the next read.
      if (saved?.person_id && profiles.has(saved.person_id)) profiles.set(saved.person_id, saved);
      changed();
      if (['show_working', 'show_agents', 'show_level', 'show_activity'].some((k) => k in patch)) await publish({ force: true }).catch(() => {});
      if ('show_status' in patch) await syncStatus().catch(() => {});
      return saved;
    },

    // No minutes is until I turn it off, held as a date ten years ahead.
    goInvisible(minutes: number | null = null) {
      const m = minutes == null ? 3650 * 24 * 60 : Math.max(1, Math.min(48 * 60, Number(minutes) || 60));
      return this.saveProfile({ invisible_until: new Date(now() + m * 60_000).toISOString() });
    },
    comeBack() { return this.saveProfile({ invisible_until: null }); },

    link: (roomId: string) => need().roomLink(roomId),
    revokeLink: (roomId: string) => need().revokeRoomLink(roomId),
    preview: (token: string) => need().roomPreview(token),
    listed: () => need().listedRooms(),
    invitesSent: (roomId: string) => need().roomInvitesSent(roomId),
    joinByLink: (token: string) => after(need().joinRoomByLink(token)),
    joinListed: (roomId: string) => after(need().joinListedRoom(roomId)),
    acceptInvite: (roomId: string) => after(need().acceptRoomInvite(roomId)),
    invite: async (roomId: string, email: unknown) => {
      const clean = String(email ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error(`${clean || 'that'} is not an email address`);
      await need().inviteToRoom(roomId, clean);
    },
    // Groups are your team's: a paid team is how you share one with anyone else.
    async create({ name, kind = 'room', listed = false, inviteOnly = false, people: who = [] }: { name: unknown; kind?: string; listed?: boolean; inviteOnly?: boolean; people?: string[] }) {
      const mates = new Set((team()?.people ?? []).map((p) => p.id));
      if (kind !== 'group' || listed || !who.length || who.some((id) => id !== meId() && !mates.has(id))) throw new Error('A group is only ever people on your team');
      const id = await need().createRoom({ name: String(name ?? '').trim(), kind, listed, inviteOnly, people: who });
      prefs.set(meId(), { pinned: [...new Set([...prefs.get(meId()).pinned, id])] });
      await refresh();
      return id;
    },
    rename: (roomId: string, name: string) => after(need().renameRoom(roomId, name)),
    leave: async (roomId: string) => {
      await need().leaveRoom(roomId);
      const p = prefs.get(meId());
      prefs.set(meId(), { pinned: p.pinned.filter((x) => x !== roomId), muted: p.muted.filter((x) => x !== roomId), markedUnread: p.markedUnread.filter((x) => x !== roomId) });
      await refresh();
    },
    remove: (roomId: string, personId: string) => after(need().removeRoomMember(roomId, personId)),

    pin(roomId: string, on = true) {
      const p = prefs.get(meId());
      prefs.set(meId(), { pinned: on ? [...new Set([...p.pinned, roomId])] : p.pinned.filter((x) => x !== roomId) });
      changed();
    },
    mute(roomId: string, on = true) {
      const p = prefs.get(meId());
      prefs.set(meId(), { muted: on ? [...new Set([...p.muted, roomId])] : p.muted.filter((x) => x !== roomId) });
      changed();
    },
  };
  return api;
}
