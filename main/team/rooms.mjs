// ROOMS ON THIS MAC (w-3d0fa23ffb, docs/team/ROOMS-PLAN.md): the rooms I am in,
// each room's wall and chat, and the presence row this Mac publishes. Lives
// inside the team service (main/team/index.mjs) and only runs while Rooms is
// switched on in Alpha features and someone is signed in.
import fs from 'node:fs';
import path from 'node:path';
import { wallCards, myPresence, displayNameOf, withoutHidden } from '../../shared/room-cards.mjs';
import { GENERAL_ROOM } from './rooms-memory.mjs';
import { ROOM_FILE_NAME, FILE_EXISTS } from './rooms-shape.mjs';

const MESSAGES_HELD = 200;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Played voice notes and opened attachments, so a second play is not a second
// download; bounded by count and by size, since one file can be 10 MB.
const FILES_HELD = 40;
const FILE_CHARS_HELD = 64_000_000;
const HEARTBEAT_MS = 5 * 60_000;
const SETTLE_MS = 400;

// Pins, mutes, rooms marked unread and the first-room pin are this Mac's,
// kept per person.
export function roomPrefsFile(storeRoot) {
  return path.join(storeRoot, '.rooms.json');
}

const PREFS = { pinned: [], muted: [], markedUnread: [], autoPinned: false };

function prefsStore(file) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) ?? {}; } catch { return {}; } };
  return {
    get: (who) => ({ ...PREFS, ...(read()[who] ?? {}) }),
    set: (who, patch) => {
      const all = read();
      all[who] = { ...PREFS, ...(all[who] ?? {}), ...patch };
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(all, null, 2)); } catch { /* a pin that is not kept is not worth failing over */ }
      return all[who];
    },
  };
}

const EMPTY = { on: false, ready: false, rooms: [], messages: {}, me: null, ranks: {}, invites: [], mentions: [], error: null };

const reactionKey = (x) => `${x.messageId}\n${x.by}\n${x.emoji}`;

// Only reactions that are on, in the order they were made. Built from Maps so
// an emoji spelled "__proto__" is an ordinary key.
function withReactions(held, rows) {
  const on = [...(rows?.values() ?? [])].filter((x) => x.on).sort((a, b) => a.at - b.at);
  const byMessage = new Map();
  for (const x of on) {
    const emojis = byMessage.get(x.messageId) ?? new Map();
    emojis.set(x.emoji, [...(emojis.get(x.emoji) ?? []), x.by]);
    byMessage.set(x.messageId, emojis);
  }
  return held.map((m) => ({ ...m, reactions: m.deleted ? {} : Object.fromEntries(byMessage.get(m.id) ?? []) }));
}

// Padding taken off, so a file of exactly 10 MB is not refused.
const bytesOf = (b64) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

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
  onChange = () => {},
  timers = { setTimeout, clearTimeout },
}) {
  const prefs = prefsStore(prefsFile);
  let state = { ...EMPTY };
  let people = new Map(); // roomId -> [personId]
  let names = new Map(); // roomId -> room_names rows, or null on a cloud without them
  let profiles = new Map(); // personId -> row
  let presence = []; // rows
  let messages = new Map(); // roomId -> [message], oldest first
  let reads = new Map(); // roomId -> ms
  let reactions = new Map(); // roomId -> Map(reactionKey -> reaction), off ones too
  let files = new Map(); // `${roomId}/${name}` -> base64, oldest first
  let mentioned = []; // my newest mentions, which may be older than the messages held
  let unsubscribe = null;
  let started = null; // the backend rooms were started on
  let setUp = false; // my profile made, Coworking joined if I have nowhere else, realtime on
  let lastSent = null;
  let lastSentAt = 0;
  let refreshing = null;
  let again = false;
  let gen = 0; // bumped by every change made here, see refresh
  let settle = null;

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
    const mentions = [];
    const mine = ownWork();
    const shown = new Map();
    const rooms = (state.rawRooms ?? []).map((r) => {
      const held = messages.get(r.id) ?? [];
      shown.set(r.id, withReactions(held, reactions.get(r.id)));
      const readAt = reads.get(r.id) ?? 0;
      const unreadMsgs = held.filter((m) => m.at > readAt && m.by !== who && !m.deleted);
      const called = names.get(r.id) ?? null;
      // Everyone in the room by name, invisible or with no card, for the chat.
      const everyone = called?.map((n) => ({ id: n.person_id, name: n.has_card ? n.name : displayNameOf(n.name), avatarUrl: n.avatar_url ?? null })) ?? null;
      const nameOf = (id) => profiles.get(id)?.display_name || everyone?.find((p) => p.id === id)?.name || '';
      const pool = new Map([...mentioned.filter((m) => m.roomId === r.id && m.at > readAt && m.by !== who && !m.deleted), ...unreadMsgs].map((m) => [m.id, m]));
      for (const m of pool.values()) {
        if (m.mentions.includes(who)) mentions.push({ id: `room-mention:${m.id}`, messageId: m.id, roomId: r.id, roomName: r.name, by: m.by, byName: nameOf(m.by), body: m.body, at: m.at });
      }
      const wall = wallCards({ members: people.get(r.id) ?? [], profiles: [...profiles.values()], presence, teammates, teamCards: t.cards ?? [], meId: who, now: at, mine, names: called, listed: !!r.listed });
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
      messages: Object.fromEntries(rooms.map((r) => [r.id, shown.get(r.id)])),
      mentions: mentions.sort((a, b) => b.at - a.at),
    };
  }

  const changed = () => { build(); onChange(); };

  // The thread this Mac's newest agent is on, for my own card only.
  function ownWork() {
    let f = {};
    try { f = presenceFacts() ?? {}; } catch { return null; }
    const lead = [...(f.running ?? [])].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
    if (!lead) return { workingOn: null, agents: 0 };
    const item = (f.items ?? []).find((i) => i.id === lead.itemId);
    return { workingOn: (String(item?.label ?? '').trim() || String(item?.title ?? '')).slice(0, 64) || null, agents: f.running.length };
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
      const ids = new Map();
      const named = new Map();
      await Promise.all(rooms.map(async (r) => {
        const [who, called] = await Promise.all([b.roomPeople(r.id), b.roomNames ? b.roomNames(r.id).catch(() => null) : null]);
        ids.set(r.id, who);
        named.set(r.id, called);
      }));
      const everyone = [...new Set([meId(), ...[...ids.values()].flat()])].filter(Boolean);
      const [profileRows, presenceRows, readRows, mine, invites, ranks, mentionRows] = await Promise.all([
        b.roomProfiles(everyone), b.roomPresence(everyone), b.roomReads(), b.myRoomProfile(),
        b.pendingRoomInvites().catch(() => []), b.agentboxRanks(everyone).catch(() => ({})),
        b.roomMentions({ limit: 50 }).catch(() => []),
      ]);
      const held = new Map();
      const reacted = new Map();
      await Promise.all(rooms.map(async (r) => {
        const [fresh, rows] = await Promise.all([b.roomMessages(r.id, { limit: MESSAGES_HELD }), b.roomReactions(r.id)]);
        held.set(r.id, merge(messages.get(r.id), fresh));
        reacted.set(r.id, new Map(rows.map((x) => [reactionKey(x), x])));
      }));
      if (backend() !== b || started !== b) return;
      if (g !== gen) { again = true; return; }
      people = ids;
      names = named;
      profiles = new Map(profileRows.map((row) => [row.person_id, row]));
      presence = presenceRows;
      messages = held;
      reactions = reacted;
      reads = new Map(readRows.map((r) => [r.roomId, r.readAt]));
      mentioned = mentionRows;
      autoPin(rooms);
      state = { ...state, ready: true, rawRooms: rooms, me: mine, invites, ranks, error: null };
    } catch (err) {
      state = { ...state, error: String(err?.message ?? err) };
      log(`rooms: ${state.error}`);
    }
    changed();
  }

  function merge(old = [], fresh = []) {
    const byId = new Map(old.map((m) => [m.id, m]));
    for (const m of fresh) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id))).slice(-MESSAGES_HELD);
  }

  // The first room I am ever in is pinned for me, once.
  function autoPin(rooms) {
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
  function holdMessage(m) {
    const held = messages.get(m.roomId) ?? [];
    if ((m.editedAt == null && !m.deleted) || held.some((x) => x.id === m.id)) messages.set(m.roomId, merge(held, [m]));
    mentioned = mentioned.map((x) => (x.id === m.id ? m : x));
    if (m.deleted) dropReactions(m.roomId, m.id);
  }

  function holdReaction(x) {
    const held = reactions.get(x.roomId) ?? new Map();
    held.set(reactionKey(x), x);
    reactions.set(x.roomId, held);
  }

  function dropReactions(roomId, messageId) {
    const held = reactions.get(roomId);
    if (held) for (const [k, x] of held) if (x.messageId === messageId) held.delete(k);
  }

  function hear(e) {
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

  function keepFile(key, data) {
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
  async function publish({ force = false } = {}) {
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

  async function ensureProfile(b) {
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
  async function setUpOnce(b) {
    try {
      const mine = await ensureProfile(b);
      state = { ...state, me: mine };
      // Someone with no team and no room starts in Coworking, pinned.
      const rooms = await b.myRooms();
      if (!rooms.length && !(team()?.team)) await b.joinListedRoom(GENERAL_ROOM).catch((err) => log(`rooms: Coworking: ${err.message}`));
      unsubscribe ??= b.subscribeRooms(hear);
      setUp = true;
      state = { ...state, error: null };
    } catch (err) {
      state = { ...state, error: String(err?.message ?? err) };
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
    reactions = new Map(); files = new Map();
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
    if (!setUp) { await setUpOnce(started); if (setUp) await refresh(); }
    await syncName().catch((err) => log(`rooms: name: ${err.message}`));
    await syncStatus().catch((err) => log(`rooms: status: ${err.message}`));
    await publish().catch((err) => log(`rooms: presence: ${err.message}`));
  }

  // A card made before my name was known reads "Someone" until it is.
  async function syncName() {
    const mine = state.me;
    const name = displayNameOf(me()?.name ?? '');
    if (!mine || !name || (mine.display_name && mine.display_name !== 'Someone')) return;
    const saved = await backend().saveRoomProfile({ display_name: name });
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
    const saved = await backend().saveRoomProfile({ status_text: text, status_until: until });
    local();
    state = { ...state, me: saved };
    changed();
  }

  const need = () => { const b = backend(); if (!b || !started) throw new Error('turn on Rooms and sign in first'); return b; };
  const after = async (p) => { const out = await p; await refresh(); return out; };

  return {
    state: () => { const { rawRooms, ...shown } = state; return shown; },
    start, stop, tick, refresh, publish,

    async send(roomId, body, { inReplyTo = null, mentions = [] } = {}) {
      const b = need();
      const m = await b.sendRoomMessage(roomId, { body: String(body ?? '').trim(), inReplyTo, mentions });
      local();
      messages.set(roomId, merge(messages.get(roomId), [m]));
      reads.set(roomId, Math.max(reads.get(roomId) ?? 0, m.at));
      changed();
      return m;
    },

    async markRead(roomId) {
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

    // `at` is the time of the first message that should read as unread.
    async markUnread(roomId, at) {
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

    async react(roomId, messageId, emoji, on = true) {
      const b = need();
      await b.reactRoomMessage(messageId, emoji, !!on);
      const key = reactionKey({ messageId, by: meId(), emoji });
      if (!on && !reactions.get(roomId)?.has(key)) return;
      local();
      holdReaction({ messageId, roomId, by: meId(), emoji, on: !!on, at: now() });
      changed();
    },

    async edit(roomId, messageId, body, { mentions = [] } = {}) {
      const b = need();
      const m = await b.editRoomMessage(messageId, { body: String(body ?? '').trim(), mentions });
      local();
      holdMessage({ ...m, roomId });
      changed();
      return m;
    },

    async deleteMessage(roomId, messageId) {
      const b = need();
      await b.deleteRoomMessage(messageId);
      const was = messages.get(roomId)?.find((m) => m.id === messageId);
      local();
      if (was) holdMessage({ ...was, body: '', mentions: [], deleted: true });
      mentioned = mentioned.filter((m) => m.id !== messageId);
      dropReactions(roomId, messageId);
      changed();
    },

    async putFile(roomId, { name, dataBase64 } = {}) {
      const b = need();
      const n = String(name ?? '');
      if (!ROOM_FILE_NAME.test(n)) throw new Error(`A room cannot keep a file named “${n}”: a name starts with a letter or number and has only letters, numbers, dots, dashes and underscores, up to 160.`);
      const data = String(dataBase64 ?? '');
      if (bytesOf(data) > MAX_FILE_BYTES) throw new Error('That file is over 10 MB, the most a room takes.');
      try {
        await b.putRoomFile(roomId, n, data);
        keepFile(`${roomId}/${n}`, data);
      } catch (err) {
        if (err?.code !== FILE_EXISTS) throw err;
      }
      return n;
    },

    async file(roomId, name) {
      const b = need();
      const key = `${roomId}/${name}`;
      if (files.has(key)) {
        const data = files.get(key);
        keepFile(key, data);
        return data;
      }
      if (!ROOM_FILE_NAME.test(String(name ?? ''))) return null;
      const data = await b.roomFile(roomId, String(name));
      if (data != null) keepFile(key, data);
      return data;
    },

    async older(roomId) {
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
    async saveProfile(fields = {}) {
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
    goInvisible(minutes = null) {
      const m = minutes == null ? 3650 * 24 * 60 : Math.max(1, Math.min(48 * 60, Number(minutes) || 60));
      return this.saveProfile({ invisible_until: new Date(now() + m * 60_000).toISOString() });
    },
    comeBack() { return this.saveProfile({ invisible_until: null }); },

    link: (roomId) => need().roomLink(roomId),
    revokeLink: (roomId) => need().revokeRoomLink(roomId),
    preview: (token) => need().roomPreview(token),
    listed: () => need().listedRooms(),
    invitesSent: (roomId) => need().roomInvitesSent(roomId),
    joinByLink: (token) => after(need().joinRoomByLink(token)),
    joinListed: (roomId) => after(need().joinListedRoom(roomId)),
    acceptInvite: (roomId) => after(need().acceptRoomInvite(roomId)),
    invite: async (roomId, email) => {
      const clean = String(email ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error(`${clean || 'that'} is not an email address`);
      await need().inviteToRoom(roomId, clean);
    },
    async create({ name, kind = 'room', listed = false, inviteOnly = false, people: who = [] }) {
      const id = await need().createRoom({ name: String(name ?? '').trim(), kind, listed, inviteOnly, people: who });
      prefs.set(meId(), { pinned: [...new Set([...prefs.get(meId()).pinned, id])] });
      await refresh();
      return id;
    },
    rename: (roomId, name) => after(need().renameRoom(roomId, name)),
    leave: async (roomId) => {
      await need().leaveRoom(roomId);
      const p = prefs.get(meId());
      prefs.set(meId(), { pinned: p.pinned.filter((x) => x !== roomId), muted: p.muted.filter((x) => x !== roomId), markedUnread: p.markedUnread.filter((x) => x !== roomId) });
      await refresh();
    },
    remove: (roomId, personId) => after(need().removeRoomMember(roomId, personId)),

    pin(roomId, on = true) {
      const p = prefs.get(meId());
      prefs.set(meId(), { pinned: on ? [...new Set([...p.pinned, roomId])] : p.pinned.filter((x) => x !== roomId) });
      changed();
    },
    mute(roomId, on = true) {
      const p = prefs.get(meId());
      prefs.set(meId(), { muted: on ? [...new Set([...p.muted, roomId])] : p.muted.filter((x) => x !== roomId) });
      changed();
    },
  };
}
