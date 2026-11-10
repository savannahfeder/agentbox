// The columns both room backends read and write, so they hand the app the
// same shapes.
import type { RoomDecision, RoomMessage, RoomReaction, RoomRow } from './rooms.mts';

export const PROFILE_FIELDS = ['display_name', 'avatar_url', 'headline', 'bio', 'show_working', 'show_agents', 'show_level', 'show_status', 'show_activity', 'invisible_until', 'status_text', 'status_until'];
export const PRESENCE_FIELDS = ['gone', 'agents_running', 'working_on', 'working_private', 'working_at', 'hours_total', 'hours_week', 'week_start', 'hours_today', 'day', 'streak_days', 'active_days', 'hours_by_month', 'activity'];
// What a cloud from before 20261022000100_rooms_show_everyone.sql has.
export const OLD_PRESENCE_FIELDS = PRESENCE_FIELDS.filter((f) => f !== 'activity');
export const PROFILE_COLS = ['person_id', ...PROFILE_FIELDS, 'updated_at'].join(',');
export const PRESENCE_COLS = ['person_id', 'device', ...PRESENCE_FIELDS, 'updated_at'].join(',');
export const OLD_PRESENCE_COLS = ['person_id', 'device', ...OLD_PRESENCE_FIELDS, 'updated_at'].join(',');

export const pick = (o: Record<string, unknown> | null | undefined, keys: readonly string[]): Record<string, unknown> => Object.fromEntries(keys.filter((k) => o && k in o).map((k) => [k, o![k]]));

export interface RoomDbRow {
  id: string;
  name: string;
  kind: string;
  team_id?: string | null;
  listed?: boolean | null;
  invite_only?: boolean | null;
  role: string;
  members?: number | string | null;
  created_at: string;
}

export interface MessageDbRow {
  id: string;
  room_id: string;
  by_person?: string | null;
  body: string;
  in_reply_to?: string | null;
  mentions?: string[] | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
}

export interface ReactionDbRow {
  message_id: string;
  room_id: string;
  person_id: string;
  emoji: string;
  is_on: boolean;
  updated_at: string;
}

export interface DecisionDbRow {
  room_id: string;
  message_id: string;
  kind: string;
  project?: string | null;
  body: string;
  said_by?: string | null;
  marked_by: string;
  is_on: boolean;
  updated_at: string;
}

export const roomOut = (r: RoomDbRow): RoomRow => ({
  id: r.id, name: r.name, kind: r.kind, teamId: r.team_id ?? null, listed: !!r.listed, inviteOnly: !!r.invite_only,
  role: r.role, members: Number(r.members) || 0, createdAt: Date.parse(r.created_at) || 0,
});

export const MSG_COLS = 'id,room_id,by_person,body,in_reply_to,mentions,created_at,edited_at,deleted_at';
export const REACTION_COLS = 'message_id,room_id,person_id,emoji,is_on,updated_at';

export const messageOut = (r: MessageDbRow): RoomMessage => ({
  id: r.id, roomId: r.room_id, by: r.by_person ?? null, body: r.deleted_at ? '' : r.body, inReplyTo: r.in_reply_to ?? null,
  mentions: r.deleted_at ? [] : r.mentions ?? [], at: Date.parse(r.created_at),
  editedAt: r.edited_at ? Date.parse(r.edited_at) : null, deleted: !!r.deleted_at,
});

export const reactionOut = (r: ReactionDbRow): RoomReaction => ({
  messageId: r.message_id, roomId: r.room_id, by: r.person_id, emoji: r.emoji, on: !!r.is_on, at: Date.parse(r.updated_at),
});

export const DECISION_COLS = 'room_id,message_id,kind,project,body,said_by,marked_by,is_on,updated_at';

export const decisionOut = (r: DecisionDbRow): RoomDecision => ({
  roomId: r.room_id, messageId: r.message_id, kind: r.kind, project: r.project ?? null, body: r.body,
  saidBy: r.said_by ?? null, by: r.marked_by, on: !!r.is_on, at: Date.parse(r.updated_at),
});

// The checks room_files makes (20261022000000_room_messages_do_more.sql).
export const ROOM_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;
// 10 MiB of file, and that much as base64 with its padding.
export const ROOM_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const ROOM_FILE_MAX_DATA = 13_981_016;
// A name already in the room: the file is there, which is what was wanted.
export const FILE_EXISTS = 'room-file-exists';
export function fileExists(name: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(`${name} is already in the room`);
  err.code = FILE_EXISTS;
  return err;
}
