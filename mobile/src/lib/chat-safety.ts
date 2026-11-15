// Report, block and the word filter for the phone's chats (App Review 1.2).
// A block is kept on this phone; a report goes to the feedback inbox, where a
// person reads it, and hides the message here at once.
import type { Room, RoomMessage } from '../../../renderer/src/types';
import type { ReportAbout } from './report';

export const BLOCKED_KEY = 'chats.blocked';
export const REPORTED_KEY = 'chats.reported';
export const RULES_KEY = 'chats.rules-agreed';

const ids = (raw: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
};
export const blockedFrom = (raw: string | null | undefined) => new Set(ids(raw));
export const withBlocked = (raw: string | null | undefined, id: string) => JSON.stringify([...new Set([...ids(raw), id])]);
export const withoutBlocked = (raw: string | null | undefined, id: string) => JSON.stringify(ids(raw).filter((x) => x !== id));

export function shownMessages(list: readonly RoomMessage[], { blocked, reported, me = null }: { blocked: ReadonlySet<string>; reported: ReadonlySet<string>; me?: string | null }): RoomMessage[] {
  return list.filter((m) => (m.by === me && me !== null) || (!reported.has(m.id) && !(m.by && blocked.has(m.by))));
}

/** A two-person chat with someone blocked goes; a group they are one of stays, without their words. */
export function roomsShown(rooms: readonly Room[], blocked: ReadonlySet<string>, me: string | null): Room[] {
  if (!blocked.size) return [...rooms];
  return rooms.filter((r) => {
    if (r.kind !== 'group' || r.members !== 2) return true;
    const other = (r.people ?? []).map((p) => p.id).find((id) => id !== me);
    return !(other && blocked.has(other));
  });
}

export function reportAboutMessage({ message, roomName, byName }: { message: RoomMessage; roomName: string; byName: string }): NonNullable<ReportAbout> {
  return { kind: 'message', ref: `${message.roomId}/${message.id}`, title: `A message from ${byName} (${message.by ?? 'unknown'}) in ${roomName}`, answer: message.body };
}

export type Found = { start: number; end: number };

/** The words `find` finds, each covered by as many stars as it has letters. */
export function cleanWords(text: string, find: (text: string) => Found[]): string {
  if (!text) return text;
  const chars = text.split('');
  for (const f of find(text)) for (let i = f.start; i < f.end && i < chars.length; i++) if (/\S/.test(chars[i])) chars[i] = '*';
  return chars.join('');
}
