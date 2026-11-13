// Groups on the phone (renderer/src/phone-groups.ts): where the tab sits and
// the rules the Groups place draws by, apart from the drawing.
import { TABS, type TabId } from './tabs';
import type { Room, RoomCard, RoomMessage } from '../../../renderer/src/types';

export type PlaceId = TabId | 'everything' | 'chats';

/**
 * The tabs: the four, or with a team on (Groups or AI teammates) Needs you,
 * Everything else, which holds your In progress, Later and Done as your card's
 * work (threads/Pages.tsx `StateTabsRow`), and Chats.
 */
export function bottomTabs(team: boolean): { id: PlaceId; label: string }[] {
  return team ? [TABS[0], { id: 'everything', label: 'Everything else' }, { id: 'chats', label: 'Chats' }] : [...TABS];
}

export const LAST_GROUP_KEY = 'groups.last';

export type BodyPart = { kind: 'words'; text: string } | { kind: 'picture'; name: string; alt: string } | { kind: 'file'; name: string; label: string };
const STORED = /!?\[([^\]]*)\]\(attachments\/([A-Za-z0-9][\w.-]{0,159})\)/g;

/** A message's words, and the files it links as `attachments/<name>`, in order (RoomChat.tsx `storedIn`). */
export function bodyParts(text: string): BodyPart[] {
  const out: BodyPart[] = [];
  let at = 0;
  for (const m of text.matchAll(STORED)) {
    const words = text.slice(at, m.index).trim();
    if (words) out.push({ kind: 'words', text: words });
    out.push(m[0].startsWith('!') ? { kind: 'picture', name: m[2], alt: m[1] } : { kind: 'file', name: m[2], label: m[1] || m[2] });
    at = m.index + m[0].length;
  }
  const rest = text.slice(at).trim();
  // The full stop that followed a link means nothing alone under its file.
  if (rest && !(at > 0 && /^[.,;:!?]+$/.test(rest))) out.push({ kind: 'words', text: rest });
  return out;
}

const PICTURE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic' };
export const pictureType = (name: string) => PICTURE_TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/png';

/** The group Groups opens on: the one open last while you are still in it, else your team's, else the newest. */
export function groupToOpen(rooms: readonly Room[], last: string | null): Room | null {
  return rooms.find((r) => r.id === last)
    ?? rooms.find((r) => r.teamId)
    ?? [...rooms].sort((a, b) => b.lastAt - a.lastAt)[0]
    ?? null;
}

/** A named group's name, or the people in a chat. */
export function groupName(r: Pick<Room, 'kind' | 'name' | 'wall'>): string {
  if (r.kind !== 'group') return r.name;
  return r.wall.filter((c) => !c.me).map((c) => c.name || 'Someone').join(', ') || r.name;
}

/** Named groups first, then chats, each newest first (renderer GroupList `groupChoices`). */
export function groupsInOrder(rooms: readonly Room[]): Room[] {
  const named = (r: Room) => (r.kind === 'group' ? 1 : 0);
  return [...rooms].sort((a, b) => named(a) - named(b) || b.lastAt - a.lastAt);
}

export { drawnRoots as chatRoots } from '../../../renderer/src/team/rooms/room-chat-rules';

export function repliesTo(messages: readonly RoomMessage[], id: string): RoomMessage[] {
  return messages.filter((m) => m.inReplyTo === id && !m.deleted);
}

/** A message starts a run, with its face and name, unless the one before is the same person's within five minutes. */
export function startsRun(list: readonly RoomMessage[], i: number): boolean {
  const m = list[i];
  const before = list[i - 1];
  return !before || before.by !== m.by || m.at - before.at > 5 * 60_000 || new Date(before.at).toDateString() !== new Date(m.at).toDateString();
}

/** You first; then working, most agents first; then the rest; people not on yet last (renderer GroupPage `inGroupOrder`). */
export function peopleInOrder(cards: readonly RoomCard[]): RoomCard[] {
  const rank = (c: RoomCard) => (c.me ? -1 : c.away ? 2 : (c.agents ?? 0) > 0 ? 0 : 1);
  return [...cards].sort((a, b) => rank(a) - rank(b) || (b.agents ?? 0) - (a.agents ?? 0));
}

/** The label over a day's first message. */
export function dayWords(at: number, now: number): string {
  const day = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** What the People list says under a name (renderer GroupPage `onWords`). */
export function onWords(c: RoomCard): string {
  if (c.away) return 'Not on Groups yet';
  if (c.agents) return c.workingOn ?? c.bio ?? 'Private thread';
  return c.status ?? 'Not running';
}
