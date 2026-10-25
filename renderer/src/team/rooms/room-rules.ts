// The rules the room screens draw by (w-3d0fa23ffb), kept apart from the
// drawing so they can be tested. tests/a-room-reads-the-way-it-was-approved.
import type { Person, Room, RoomCard, RoomMention, RoomProfile, ThreadCard } from '../../types';
import { Name } from '../../../../shared/product-name.mjs';

type Shares = { me: boolean; teammate: boolean; showActivity: boolean; activity?: unknown[] | null; away?: boolean };
/** Whose threads reach me as the team's thread cards: my own, or a teammate's who shares them. */
const onTheTeamBoard = (c: Shares) => c.me || (c.teammate && c.showActivity);
/** Their page's Activity tab: off the team's cards, or off their presence for someone outside my team who shows it to their rooms. */
export const activityShown = (c: Shares) => onTheTeamBoard(c) || (!c.teammate && Array.isArray(c.activity));

/**
 * Which of the hours chart's months carry their name. The line rises from
 * nothing the month before the first hours; that month is left unnamed, since
 * the chart is "since" the first month with hours.
 */
export function chartNamed(months: readonly string[], byMonth: readonly { month: string; hours: number }[]): boolean[] {
  const first = byMonth.find((m) => m.hours > 0)?.month ?? null;
  return months.map((m) => !first || m >= first);
}

const PRESENCE = 'presence:';
/** A card made from a room-mate's presence line, with no thread behind it to open. */
export const isPresenceCard = (c: Pick<ThreadCard, 'threadId'>) => c.threadId.startsWith(PRESENCE);

/** Their Activity tab's threads: the team's cards for a teammate and for me; for someone outside my team, the lines on their presence. */
export function activityCards(card: RoomCard, cards: readonly ThreadCard[]): ThreadCard[] {
  const team = cards.filter((c) => c.personId === card.id);
  if (card.teammate || team.length || !card.activity) return team;
  return card.activity.map((a, i) => ({
    personId: card.id, threadId: `${PRESENCE}${card.id}:${i}`, visible: true, title: a.title, project: a.project, state: a.state, priority: null,
    problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: a.at,
  }));
}

/** Everyone on my rooms' walls but me, as people the board can name and draw. */
export function roomMatesById(rooms: readonly Pick<Room, 'wall'>[]): Map<string, Person> {
  const out = new Map<string, Person>();
  for (const r of rooms) for (const c of r.wall) if (!c.me && !out.has(c.id)) out.set(c.id, { id: c.id, email: '', name: c.name, avatarUrl: c.avatarUrl });
  return out;
}

/** Every room-mate outside my team's presence lines, as cards for the board their page draws. */
export function roomMateCards(rooms: readonly Pick<Room, 'wall'>[]): ThreadCard[] {
  const seen = new Set<string>();
  const out: ThreadCard[] = [];
  for (const r of rooms) {
    for (const c of r.wall) {
      if (c.me || c.teammate || !Array.isArray(c.activity) || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(...activityCards(c, []));
    }
  }
  return out;
}

/** The chat's people: everyone in the room by name where the cloud can say, else the wall. */
export function chatPeople(room: Pick<Room, 'people' | 'wall'>, meId: string | null): { id: string; name: string; avatarUrl: string | null; me: boolean }[] {
  if (!room.people) return room.wall.map((c) => ({ id: c.id, name: c.name, avatarUrl: c.avatarUrl, me: c.me }));
  return room.people.map((p) => ({ ...p, me: p.id === meId }));
}

const PICK_KEY = 'rooms.board.people';
const LATER_KEY = 'rooms.board.later';
const TAB_KEY = 'rooms.tab';
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
const local = (): Store => (typeof localStorage === 'undefined' ? null : localStorage);

/** The room picked for the Threads tab bar: a room id, 'none' after No room tab, or null before any pick. */
export function readRoomTab(store: Store = local()): string | null {
  try { return store?.getItem(TAB_KEY) || null; } catch { return null; }
}
export function writeRoomTab(choice: string, store: Store = local()) {
  try { store?.setItem(TAB_KEY, choice); } catch { /* not kept */ }
}

const CHAT_KEY = 'rooms.chat.width';
/** The chat's share of the room until it is dragged: 480 at 1440, the width that was liked. rooms.css says the same. */
export const CHAT_SHARE = 0.41;
/** Three board columns of 170 with their gaps and padding; rooms.css's max-width says the same. */
export const BOARD_LEAST = 620;

/** How wide the chat beside a room may be, given the room's width with board and chat together. */
export function chatWidth(want: number, space: number): number {
  return Math.round(Math.max(300, Math.min(want, 720, space - BOARD_LEAST)));
}
/** The width it was dragged to, or null for the room's share. */
export function readChatWidth(store: Store = local()): number | null {
  try { const n = Number(store?.getItem(CHAT_KEY)); return n > 0 ? n : null; } catch { return null; }
}
export function writeChatWidth(width: number | null, store: Store = local()) {
  try { store?.setItem(CHAT_KEY, width == null ? '' : String(Math.round(width))); } catch { /* not kept */ }
}

const NOTICE_KEY = 'rooms.notice.seen';
/** The open groups whose line about what strangers see has been answered on this Mac. */
export function readNoticeSeen(store: Store = local()): string[] {
  try { const ids = JSON.parse(store?.getItem(NOTICE_KEY) || '[]'); return Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
export function writeNoticeSeen(ids: string[], store: Store = local()) {
  try { store?.setItem(NOTICE_KEY, JSON.stringify(ids)); } catch { /* not kept */ }
}
/** Over a group anyone can join, until it has been answered once. */
export const noticeShown = (room: Pick<Room, 'id' | 'listed' | 'teamId'>, seen: readonly string[]) => room.listed && !room.teamId && !seen.includes(room.id);

const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
/** What strangers in an open group see of you, as your card's switches have it. */
export function openGroupWords(me: Pick<RoomProfile, 'show_working' | 'show_level' | 'show_agents'>): string {
  const seen = ['your name', me.show_level && 'level', me.show_agents && 'how many agents you run'].filter((x): x is string => !!x);
  const open = `Anyone on ${Name} can join this group.`;
  return me.show_working === 'everyone'
    ? `${open} They see ${andList([...seen, 'the names of your threads'])}.`
    : `${open} They see ${andList(seen)}, never your threads.`;
}

/** The room in the Threads tab: the one picked, else the first pinned room, else the first room. Never a group chat. */
export function tabRoom<R extends Pick<Room, 'id' | 'kind' | 'pinned'>>(rooms: readonly R[], choice: string | null): R | null {
  if (choice === 'none') return null;
  const own = rooms.filter((r) => r.kind !== 'group');
  return own.find((r) => r.id === choice) ?? own.find((r) => r.pinned) ?? own[0] ?? null;
}

/** The group Groups opens: the one open last while you are still in it, else as tabRoom picks, else any chat. */
export function groupInTab<R extends Pick<Room, 'id' | 'kind' | 'pinned'>>(rooms: readonly R[], last: string | null): R | null {
  return rooms.find((r) => r.id === last) ?? tabRoom(rooms, null) ?? rooms[0] ?? null;
}

/** Whose threads a room's board draws: whoever's Activity I may open, and a
 *  teammate not on Rooms yet, who has no Rooms switch but whose team cards reach me. */
export const boardPeople = <T extends Shares>(wall: readonly T[]) => wall.filter((c) => activityShown(c) || (c.teammate && !!c.away));

/** The people picked for a room's board, kept to those still on it. Nobody left means everyone. */
export function boardPicked(saved: readonly string[] | null | undefined, people: readonly { id: string }[]): string[] {
  const ids = people.map((p) => p.id);
  const kept = (saved ?? []).filter((id) => ids.includes(id));
  return kept.length ? kept : ids;
}

/** Each room's pick, by room id. */
export function readBoardPicks(store: Store = local()): Record<string, string[]> {
  try {
    const all = JSON.parse(store?.getItem(PICK_KEY) ?? 'null');
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch { return {}; }
}
export function writeBoardPicks(picks: Record<string, string[]>, store: Store = local()) {
  try { store?.setItem(PICK_KEY, JSON.stringify(picks)); } catch { /* not kept */ }
}

/** Whether a room's board shows its Later column, which it does not until asked. */
export function readBoardLater(store: Store = local()): boolean {
  try { return store?.getItem(LATER_KEY) === '1'; } catch { return false; }
}
export function writeBoardLater(shown: boolean, store: Store = local()) {
  try { store?.setItem(LATER_KEY, shown ? '1' : '0'); } catch { /* not kept */ }
}

/** Their place in the room by agent hours this week; ties share a place. */
export function weekRank(wall: readonly RoomCard[], id: string): number {
  const mine = wall.find((c) => c.id === id)?.hoursWeek ?? 0;
  return 1 + wall.filter((c) => c.hoursWeek > mine).length;
}

export function agentsWords(n: number | null): string {
  if (n == null || n <= 0) return 'Not running';
  return `${n} ${n === 1 ? 'agent' : 'agents'} working`;
}

export function initialsOf(name: string): string {
  const s = String(name ?? '').replace(/[^\p{L}\p{N} ]/gu, '').trim();
  return (s.slice(0, 2) || '?').toUpperCase();
}

/** The name drawn on a card: "You" on my own. */
export const cardName = (c: Pick<RoomCard, 'me' | 'name'>) => (c.me ? 'You' : c.name || 'Someone');

export function clockOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type Named = { id: string; name: string };

// "@Maya C." or "@Maya" names Maya. A first name two people share names
// neither, so a mention never lands on the wrong person.
export function mentionsIn(body: string, people: readonly Named[]): string[] {
  const text = ` ${String(body ?? '')} `;
  const lower = text.toLowerCase();
  const out = new Set<string>();
  const firsts = new Map<string, string[]>();
  for (const p of people) {
    const first = p.name.split(/\s+/)[0]?.toLowerCase();
    if (first) firsts.set(first, [...(firsts.get(first) ?? []), p.id]);
  }
  for (const p of people) {
    if (!p.name) continue;
    const full = `@${p.name.toLowerCase()}`;
    const first = `@${p.name.split(/\s+/)[0].toLowerCase()}`;
    if (hasWord(lower, full)) out.add(p.id);
    else if (hasWord(lower, first) && (firsts.get(first.slice(1))?.length ?? 0) === 1) out.add(p.id);
  }
  return [...out];
}

function hasWord(text: string, word: string): boolean {
  let at = text.indexOf(word);
  while (at >= 0) {
    const before = text[at - 1];
    const after = text[at + word.length];
    if (!/[\p{L}\p{N}]/u.test(before ?? ' ') && !/[\p{L}\p{N}]/u.test(after ?? ' ')) return true;
    at = text.indexOf(word, at + 1);
  }
  return false;
}

/** A message cut into plain text and the @names in it, for drawing. */
export function markMentions(body: string, names: readonly string[]): { text: string; mention: boolean }[] {
  const words = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length).map((n) => `@${n}`);
  if (!words.length) return [{ text: body, mention: false }];
  const out: { text: string; mention: boolean }[] = [];
  let rest = body;
  while (rest) {
    let best = -1;
    let hit = '';
    for (const w of words) {
      const i = rest.toLowerCase().indexOf(w.toLowerCase());
      if (i >= 0 && (best < 0 || i < best)) { best = i; hit = rest.slice(i, i + w.length); }
    }
    if (best < 0) { out.push({ text: rest, mention: false }); break; }
    if (best > 0) out.push({ text: rest.slice(0, best), mention: false });
    out.push({ text: hit, mention: true });
    rest = rest.slice(best + hit.length);
  }
  return out;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
// Invisible "until I turn it off" is held as a date far ahead.
export const UNTIL_TURNED_OFF_MS = 3650 * 24 * HOUR;

export function invisibleNotice(untilIso: string | null | undefined, now: number): string | null {
  const until = Date.parse(untilIso ?? '');
  if (!(until > now)) return null;
  const left = until - now;
  const minutes = Math.max(1, Math.round(left / MIN));
  const hours = Math.ceil(minutes / 60);
  const how = left > 365 * 24 * HOUR ? 'until you turn it off'
    : minutes < 60 ? `for ${minutes} more ${minutes === 1 ? 'minute' : 'minutes'}`
      : `for ${hours} more ${hours === 1 ? 'hour' : 'hours'}`;
  return `You are invisible ${how}. Nobody in your rooms can see you.`;
}

/** A sentence with one full stop, even when it ends on an initial like "Sam R.". */
export const sentence = (s: string) => { const t = s.trimEnd(); return t.endsWith('.') ? t : `${t}.`; };

/** Agent hours as a card or a chart says them. */
export function hoursWords(h: number): string {
  if (!(h > 0)) return '0';
  if (h >= 10) return Math.round(h).toLocaleString('en-US');
  if (h >= 0.05) return (Math.round(h * 10) / 10).toString();
  return 'under 0.1';
}

/** Minutes until local midnight, for "Until tomorrow". */
export function minutesToMidnight(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return Math.max(1, Math.round((d.getTime() - now) / MIN));
}

export function sentWords(invite: { at: number; joined: boolean }, now: number): string {
  if (invite.joined) return 'Joined';
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  if (invite.at >= day.getTime()) return 'Sent today';
  if (invite.at >= day.getTime() - 86_400_000) return 'Sent yesterday';
  return `Sent ${new Date(invite.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function findOrder<T extends { members: number; createdAt: number }>(rooms: readonly T[], order: 'popular' | 'new'): T[] {
  return [...rooms].sort(order === 'new'
    ? (a, b) => b.createdAt - a.createdAt
    : (a, b) => b.members - a.members || a.createdAt - b.createdAt);
}

/** My card leaves the wall while I am invisible, so I leave the room's people count too. */
export const peopleCount = (room: { members: number }, invisible: boolean) => Math.max(0, room.members - (invisible ? 1 : 0));

/** My card leaves the wall while I am invisible; the chat still needs my name and face. */
export function withMe<T extends { me: boolean }>(people: readonly T[], me: T | null): T[] {
  return !me || people.some((p) => p.me) ? [...people] : [...people, me];
}

export type MentionRow = RoomMention & { count: number };

/** One Needs you row per person per room, with how many they sent and the
 *  newest one's time: every row of one room opens the same chat, and a read
 *  clears them together. */
export function mentionRows(mentions: readonly RoomMention[]): MentionRow[] {
  const rows = new Map<string, MentionRow>();
  for (const m of mentions) {
    const id = `room-mention:${m.roomId}:${m.by ?? ''}`;
    const had = rows.get(id);
    rows.set(id, { ...(!had || m.at > had.at ? m : had), id, count: (had?.count ?? 0) + 1 });
  }
  return [...rows.values()].sort((a, b) => b.at - a.at);
}
