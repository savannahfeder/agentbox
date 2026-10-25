// ROOMS ON SUPABASE (w-3d0fa23ffb): the same calls as rooms-memory.mjs, against
// cloud/supabase/migrations/20261021000000_rooms.sql. Row level security and
// the functions there are what keep people apart; nothing here is trusted to.
import { Name } from '../../shared/product-name.mjs';
import { PROFILE_COLS, PRESENCE_COLS, OLD_PRESENCE_COLS, PROFILE_FIELDS, PRESENCE_FIELDS, OLD_PRESENCE_FIELDS, MSG_COLS, REACTION_COLS, pick, roomOut, messageOut, reactionOut, fileExists } from './rooms-shape.mjs';

// How long the chat waits to hear that reactions are listening before it says
// it is ready anyway.
const REACTIONS_WAIT_MS = 10_000;
// The columns a cloud from before 20261022000000_room_messages_do_more.sql has.
const OLD_MSG_COLS = 'id,room_id,by_person,body,in_reply_to,mentions,created_at';
const OLD_RECHECK_MS = 60_000;
// Postgres and PostgREST's words for a column or a table that is not there.
const notThere = (err) => ['42703', '42P01', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(String(err?.code ?? ''))
  || /does not exist|could not find/i.test(String(err?.message ?? ''));

export function roomsSupabase(client, myId, must) {
  const rpc = async (fn, args, what) => must(await client.rpc(fn, args), what);
  // AN APP CAN BE UPDATED BEFORE ITS CLOUD IS, since the cloud's update is run
  // by hand. Until it is, messages are read on the columns it has and nothing
  // hangs off them, rather than the whole chat failing to read.
  // The update can land while the app is open, so an old cloud is asked again
  // after a while. Anything only an updated cloud can do settles it for good,
  // since a cloud is never taken back, so a late answer from before is ignored.
  let oldSince = 0;
  let updated = false;
  const isOld = () => !updated && oldSince > 0 && Date.now() - oldSince < OLD_RECHECK_MS;
  const settle = () => { updated = true; oldSince = 0; };
  // The same for presence on a cloud from before 20261022000100: no activity.
  let noActivitySince = 0;
  const noActivity = () => noActivitySince > 0 && Date.now() - noActivitySince < OLD_RECHECK_MS;
  const reading = async (make, what) => {
    const old = isOld();
    let res = await make(old ? OLD_MSG_COLS : MSG_COLS, old);
    if (res.error && !old && notThere(res.error)) {
      if (!updated) oldSince = Date.now();
      res = await make(OLD_MSG_COLS, true);
    } else if (!old && !res.error) settle();
    return must(res, what);
  };
  // What only an updated cloud can do says so, in place of a database error.
  const BEHIND = 'Your team cloud needs its latest update for this. Ask whoever set it up to apply it.';
  const newer = async (res, what) => {
    if (res.error && notThere(res.error)) throw new Error(BEHIND);
    const data = must(res, what);
    settle();
    return data;
  };
  const newRpc = async (fn, args, what) => newer(await client.rpc(fn, args), what);

  // A row of my own: changed where it is, made when it is not there. Never an
  // upsert, whose update half rewrites the key columns, which nobody may
  // update on the hosted cloud ("permission denied", 2026-10-21).
  async function saveOwn(table, keys, fields, cols, what) {
    const change = async () => {
      let q = Object.keys(fields).length ? client.from(table).update(fields) : client.from(table).select(cols);
      for (const [k, v] of Object.entries(keys)) q = q.eq(k, v);
      return must(await (Object.keys(fields).length ? q.select(cols) : q), what);
    };
    const had = await change();
    if (had.length) return had[0];
    const made = await client.from(table).insert({ ...keys, ...fields }).select(cols);
    // Another Mac of mine made it a moment ago.
    if (made.error?.code === '23505') return (await change())[0] ?? null;
    return must(made, what)[0] ?? null;
  }

  return {
    async myRooms() {
      await myId();
      return ((await rpc('my_rooms', {}, 'reading your rooms')) ?? []).map(roomOut);
    },

    async roomPeople(roomId) {
      await myId();
      const rows = (await rpc('room_people', { r: roomId }, 'reading who is in the room')) ?? [];
      return rows.map((r) => (typeof r === 'string' ? r : r.room_people ?? r.person_id)).filter(Boolean);
    },

    // Null on a cloud without room_names, which the wall and chat read as "use the cards".
    async roomNames(roomId) {
      await myId();
      const res = await client.rpc('room_names', { r: roomId });
      if (res.error && notThere(res.error)) return null;
      return (must(res, 'reading the names in the room') ?? []).map((r) => ({ person_id: r.person_id, name: r.name ?? '', avatar_url: r.avatar_url ?? null, has_card: !!r.has_card }));
    },

    async roomProfiles(ids) {
      await myId();
      if (!ids?.length) return [];
      return must(await client.from('room_profiles').select(PROFILE_COLS).in('person_id', ids), 'reading people in your rooms');
    },

    async roomPresence(ids) {
      await myId();
      if (!ids?.length) return [];
      const read = () => client.from('room_presence').select(noActivity() ? OLD_PRESENCE_COLS : PRESENCE_COLS).in('person_id', ids);
      let res = await read();
      if (res.error && !noActivity() && notThere(res.error)) { noActivitySince = Date.now(); res = await read(); }
      return must(res, 'reading who is working');
    },

    async myRoomProfile() {
      const me = await myId();
      const rows = must(await client.from('room_profiles').select(PROFILE_COLS).eq('person_id', me).limit(1), 'reading your room profile');
      return rows[0] ?? null;
    },

    async saveRoomProfile(fields) {
      const me = await myId();
      return saveOwn('room_profiles', { person_id: me }, pick(fields, PROFILE_FIELDS), PROFILE_COLS, 'saving your room profile');
    },

    async putPresence(device, fields) {
      const me = await myId();
      const put = () => saveOwn('room_presence', { person_id: me, device }, pick(fields, noActivity() ? OLD_PRESENCE_FIELDS : PRESENCE_FIELDS), 'person_id', 'telling your rooms what you are doing');
      try { await put(); } catch (err) {
        if (noActivity() || !('activity' in (fields ?? {})) || !notThere(err)) throw err;
        noActivitySince = Date.now();
        await put();
      }
    },

    async roomMessages(roomId, { before = null, limit = 200 } = {}) {
      await myId();
      return (await reading((cols) => {
        let q = client.from('room_messages').select(cols).eq('room_id', roomId).order('created_at', { ascending: false }).limit(limit);
        if (before) q = q.lt('created_at', new Date(before).toISOString());
        return q;
      }, 'reading the chat')).map(messageOut).reverse();
    },

    // My newest mentions in every room I am in, however busy the room is.
    async roomMentions({ limit = 50 } = {}) {
      const me = await myId();
      return (await reading((cols, old) => {
        let q = client.from('room_messages').select(cols).contains('mentions', [me]);
        if (!old) q = q.is('deleted_at', null);
        return q.order('created_at', { ascending: false }).limit(limit);
      }, 'reading your mentions')).map(messageOut);
    },

    async sendRoomMessage(roomId, { body, inReplyTo = null, mentions = [] }) {
      const me = await myId();
      const row = await reading((cols) => client.from('room_messages').insert({ room_id: roomId, by_person: me, body, in_reply_to: inReplyTo, mentions }).select(cols).single(), 'sending your message');
      return messageOut(row);
    },

    async editRoomMessage(messageId, { body, mentions = [] }) {
      await myId();
      const row = await newRpc('edit_room_message', { m: messageId, p_body: body, p_mentions: mentions }, 'editing your message');
      return messageOut(Array.isArray(row) ? row[0] : row);
    },

    async deleteRoomMessage(messageId) {
      await myId();
      await newRpc('delete_room_message', { m: messageId }, 'deleting your message');
    },

    // Off ones too, since the service folds them. The newest 1000, oldest first.
    async roomReactions(roomId) {
      await myId();
      if (isOld()) return [];
      const res = await client.from('room_reactions').select(REACTION_COLS).eq('room_id', roomId).order('updated_at', { ascending: false }).limit(1000);
      if (res.error && notThere(res.error)) return [];
      return (await newer(res, 'reading reactions')).map(reactionOut).reverse();
    },

    async reactRoomMessage(messageId, emoji, on = true) {
      await myId();
      await newRpc('react_room_message', { m: messageId, p_emoji: emoji, p_on: !!on }, 'reacting');
    },

    async putRoomFile(roomId, name, data) {
      const me = await myId();
      const { error } = await client.from('room_files').insert({ room_id: roomId, name, by_person: me, data });
      if (error?.code === '23505') { settle(); throw fileExists(name); }
      if (error && notThere(error)) throw new Error(BEHIND);
      if (error) throw new Error(`sending the file: ${error.message}`);
      settle();
      return name;
    },

    async roomFile(roomId, name) {
      await myId();
      const rows = await newer(await client.from('room_files').select('data').eq('room_id', roomId).eq('name', name).limit(1), 'taking a file from the room');
      return rows[0]?.data ?? null;
    },

    async roomReads() {
      const me = await myId();
      const rows = must(await client.from('room_reads').select('room_id,read_at').eq('person_id', me), 'reading what you have read');
      return rows.map((r) => ({ roomId: r.room_id, readAt: Date.parse(r.read_at) }));
    },

    async markRoomRead(roomId, at) {
      await myId();
      await rpc('mark_room_read', { r: roomId, at: new Date(at).toISOString() }, 'marking the room read');
    },

    async markRoomUnread(roomId, at) {
      await myId();
      await newRpc('mark_room_unread', { r: roomId, at: new Date(at).toISOString() }, 'marking the room unread');
    },

    async roomLink(roomId) {
      await myId();
      return rpc('room_link', { r: roomId }, 'making an invite link');
    },

    async revokeRoomLink(roomId) {
      await myId();
      return rpc('revoke_room_link', { r: roomId }, 'turning the old link off');
    },

    async joinRoomByLink(token) {
      await myId();
      return rpc('join_room_by_link', { tok: token }, 'joining the room');
    },

    async joinListedRoom(roomId) {
      await myId();
      return rpc('join_listed_room', { r: roomId }, 'joining the room');
    },

    async listedRooms() {
      await myId();
      const rows = (await rpc('listed_rooms', {}, 'finding rooms')) ?? [];
      return rows.map((r) => ({ id: r.id, name: r.name, members: r.members, hereNow: r.here_now, joined: !!r.joined, faces: r.faces ?? [], createdAt: Date.parse(r.created_at) || 0 }));
    },

    async roomPreview(token) {
      const rows = (await rpc('room_preview', { tok: token }, 'reading the invite')) ?? [];
      const r = rows[0];
      return r ? { name: r.name, members: r.members, agentsRunning: r.agents_running, faces: r.faces ?? [], invitedBy: r.invited_by_name ? { name: r.invited_by_name, avatar: r.invited_by_avatar ?? null } : null } : null;
    },

    async createRoom({ name, kind = 'room', listed = false, people = [], inviteOnly = false }) {
      await myId();
      return rpc('create_room', { p_name: name, p_kind: kind, p_listed: listed, p_people: people, p_invite_only: inviteOnly }, 'starting the room');
    },

    async renameRoom(roomId, name) {
      await myId();
      const rows = must(await client.from('rooms').update({ name: String(name).trim() }).eq('id', roomId).select('id'), 'renaming the room');
      if (!rows.length) throw new Error('only the room’s owner can rename it');
    },

    async leaveRoom(roomId) {
      const me = await myId();
      must(await client.from('room_members').delete().eq('room_id', roomId).eq('person_id', me), 'leaving the room');
    },

    async removeRoomMember(roomId, personId) {
      await myId();
      await rpc('remove_room_member', { r: roomId, p: personId }, 'removing them from the room');
    },

    async inviteToRoom(roomId, email) {
      const me = await myId();
      const clean = String(email).trim().toLowerCase();
      const { error } = await client.from('room_email_invites').insert({ room_id: roomId, email: clean, invited_by: me });
      if (error && error.code !== '23505') throw new Error(`inviting ${clean}: ${error.message}`);
    },

    async roomInvitesSent(roomId) {
      const me = await myId();
      const rows = must(await client.from('room_email_invites').select('email, created_at, accepted_at')
        .eq('room_id', roomId).eq('invited_by', me).order('created_at', { ascending: false }).limit(50), 'reading who you invited');
      return rows.map((r) => ({ email: r.email, at: Date.parse(r.created_at) || 0, joined: !!r.accepted_at }));
    },

    async pendingRoomInvites() {
      await myId();
      const rows = (await rpc('pending_room_invites', {}, 'reading your room invites')) ?? [];
      return rows.map((r) => ({ roomId: r.room_id, roomName: r.room_name, invitedBy: r.invited_by ?? null, invitedByName: r.invited_by_name || null }));
    },

    async acceptRoomInvite(roomId) {
      await myId();
      return rpc('accept_room_invite', { r: roomId }, 'joining the room');
    },

    async agentboxRanks(ids) {
      await myId();
      const rows = (await rpc('agentbox_ranks', { ps: ids ?? [] }, `reading places on ${Name}`)) ?? [];
      return Object.fromEntries(rows.map((r) => [r.person_id, r.rank]));
    },

    // Realtime sends inserts and updates through row level security, never a
    // delete, so leaving is heard as a room_events or access_events insert.
    // Subscribing takes a few seconds and a dropped socket subscribes again;
    // each time it is told, so whatever was sent meanwhile is read.
    subscribeRooms(onEvent) {
      // SUBSCRIBED IS SAID ONCE BOTH CHANNELS LISTEN, or the reactions one has
      // given up, since what is said on it is read again then. Said first by
      // the chat's channel alone, a reaction made in the moment between was
      // heard by nobody (measured on a local cloud). A channel that drops and
      // subscribes again says it again.
      let chatUp = false;
      let reactionsSettled = false;
      const ready = () => { if (chatUp && reactionsSettled) onEvent({ kind: 'subscribed' }); };
      const channel = client.channel(`rooms-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages' }, (p) => onEvent({ kind: 'message', message: messageOut(p.new) }))
        // An edit, and a delete, which empties the message rather than removing it.
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_messages' }, (p) => onEvent({ kind: 'message', message: messageOut(p.new) }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_presence' }, () => onEvent({ kind: 'presence' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_profiles' }, () => onEvent({ kind: 'profile' }))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_events' }, () => onEvent({ kind: 'membership' }))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'access_events' }, () => onEvent({ kind: 'membership' }))
        .subscribe((status) => { if (status === 'SUBSCRIBED') { chatUp = true; ready(); } });
      // REACTIONS ON A CHANNEL OF THEIR OWN: one change the server cannot
      // follow fails its whole channel, and a cloud not yet updated has no
      // room_reactions table. Turning a reaction off is an update too.
      const reacting = client.channel(`room-reactions-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_reactions' }, (p) => onEvent({ kind: 'reaction', reaction: reactionOut(p.new) }))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_reactions' }, (p) => onEvent({ kind: 'reaction', reaction: reactionOut(p.new) }))
        .subscribe((status) => { if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { reactionsSettled = true; ready(); } });
      const giveUp = setTimeout(() => { reactionsSettled = true; ready(); }, REACTIONS_WAIT_MS);
      giveUp.unref?.();
      return () => { clearTimeout(giveUp); client.removeChannel(channel); client.removeChannel(reacting); };
    },
  };
}
