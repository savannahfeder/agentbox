// The columns both room backends read and write, so they hand the app the
// same shapes.
export const PROFILE_FIELDS = ['display_name', 'avatar_url', 'headline', 'bio', 'show_working', 'show_agents', 'show_level', 'show_status', 'show_activity', 'invisible_until', 'status_text', 'status_until'];
export const PRESENCE_FIELDS = ['gone', 'agents_running', 'working_on', 'working_private', 'working_at', 'hours_total', 'hours_week', 'week_start', 'hours_today', 'day', 'streak_days', 'active_days', 'hours_by_month', 'activity'];
// What a cloud from before 20261022000100_rooms_show_everyone.sql has.
export const OLD_PRESENCE_FIELDS = PRESENCE_FIELDS.filter((f) => f !== 'activity');
export const PROFILE_COLS = ['person_id', ...PROFILE_FIELDS, 'updated_at'].join(',');
export const PRESENCE_COLS = ['person_id', 'device', ...PRESENCE_FIELDS, 'updated_at'].join(',');
export const OLD_PRESENCE_COLS = ['person_id', 'device', ...OLD_PRESENCE_FIELDS, 'updated_at'].join(',');

export const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && k in o).map((k) => [k, o[k]]));

export const roomOut = (r) => ({
  id: r.id, name: r.name, kind: r.kind, teamId: r.team_id ?? null, listed: !!r.listed, inviteOnly: !!r.invite_only,
  role: r.role, members: Number(r.members) || 0, createdAt: Date.parse(r.created_at) || 0,
});

export const MSG_COLS = 'id,room_id,by_person,body,in_reply_to,mentions,created_at,edited_at,deleted_at';
export const REACTION_COLS = 'message_id,room_id,person_id,emoji,is_on,updated_at';

export const messageOut = (r) => ({
  id: r.id, roomId: r.room_id, by: r.by_person ?? null, body: r.deleted_at ? '' : r.body, inReplyTo: r.in_reply_to ?? null,
  mentions: r.deleted_at ? [] : r.mentions ?? [], at: Date.parse(r.created_at),
  editedAt: r.edited_at ? Date.parse(r.edited_at) : null, deleted: !!r.deleted_at,
});

export const reactionOut = (r) => ({
  messageId: r.message_id, roomId: r.room_id, by: r.person_id, emoji: r.emoji, on: !!r.is_on, at: Date.parse(r.updated_at),
});

// The checks room_files makes (20261022000000_room_messages_do_more.sql).
export const ROOM_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;
// 10 MiB of file, and that much as base64 with its padding.
export const ROOM_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const ROOM_FILE_MAX_DATA = 13_981_016;
// A name already in the room: the file is there, which is what was wanted.
export const FILE_EXISTS = 'room-file-exists';
export function fileExists(name) {
  const err = new Error(`${name} is already in the room`);
  err.code = FILE_EXISTS;
  return err;
}
