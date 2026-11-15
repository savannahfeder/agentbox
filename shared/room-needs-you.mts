// WHICH GROUP MESSAGES ARE TO YOU, AND THE ONE ROW A GROUP PUTS IN NEEDS YOU.
// tests/a-group-message-to-you-reaches-needs-you-until-you-answer.
import { fileNewsFor, fileNewsLine, marksOf } from './artifact-marks.mts';

/** Someone in a group, by the name others call them. */
export interface RoomNamed { id: string; name?: string | null }

/** A group message, as far as these rules read it. */
export interface RoomSaid {
  id: string;
  by: string | null;
  body: string;
  at: number;
  mentions?: readonly string[];
  inReplyTo?: string | null;
  deleted?: boolean;
}

/** A file mark kept in a group: a comment or an approval, by whom and when. */
export interface RoomMarkLike { id: string; by: string | null; mark: object; at: number }

/** The one row a group puts in Needs you. */
export interface GroupRow {
  id: string;
  messageId: string;
  roomId: string;
  roomName: string;
  by: string | null;
  byName: string;
  body: string;
  at: number;
  thread: 'yours' | 'theirs' | null;
  unread: boolean;
  /** Where a row about a file opens. */
  note?: string | null;
  file?: string | null;
}

type NameOf = (id: string | null) => string;

const WORD = /[\p{L}\p{N}]/u;
const firstOf = (name: string | null | undefined): string => String(name ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';

// A person may be listed twice under two spellings of their name. A first name
// two people share names neither, so a message never lands on the wrong person.
function callNames(people: readonly RoomNamed[]): Map<string, string> {
  const owners = new Map<string, Set<string>>();
  for (const p of people) {
    const first = firstOf(p.name);
    if (first) owners.set(first, new Set([...(owners.get(first) ?? []), p.id]));
  }
  const out = new Map<string, string>();
  for (const p of people) {
    const full = String(p.name ?? '').trim().toLowerCase();
    if (!full) continue;
    out.set(full, p.id);
    const first = firstOf(p.name);
    if (owners.get(first)?.size === 1) out.set(first, p.id);
  }
  return out;
}

function hasWord(text: string, word: string): boolean {
  let at = text.indexOf(word);
  while (at >= 0) {
    if (!WORD.test(text[at - 1] ?? ' ') && !WORD.test(text[at + word.length] ?? ' ')) return true;
    at = text.indexOf(word, at + 1);
  }
  return false;
}

// "@Maya C." or "@Maya" names Maya.
export function mentionsIn(body: string | null | undefined, people: readonly RoomNamed[]): string[] {
  const lower = ` ${String(body ?? '')} `.toLowerCase();
  const out = new Set<string>();
  for (const [name, id] of callNames(people)) if (hasWord(lower, `@${name}`)) out.add(id);
  return [...out];
}

const LIST_MARK = /^\s*(?:[-*•]|\d+[.)]|\(\d+\))\s+/;
const FORMAT = /^[*_]+/;

// The names at the very start of `text`, kept only once a comma or colon closes
// them: "Maya, Sofia: could" and "Maya and Dev, could", not "Dev and Sofia are".
function openingNames(text: string, names: readonly [string, string][]): string[] {
  const out: string[] = [];
  let open: string[] = [];
  let rest = text;
  for (;;) {
    rest = rest.replace(FORMAT, '');
    const lower = rest.toLowerCase();
    const hit = names.find(([name]) => lower.startsWith(name) && !/[\p{L}\p{N}'’]/u.test(rest[name.length] ?? ' '));
    if (!hit) return out;
    open.push(hit[1]);
    rest = rest.slice(hit[0].length).replace(FORMAT, '');
    const closed = /^\s*([,:])[*_]*\s*/.exec(rest);
    if (closed) {
      out.push(...open);
      open = [];
      if (closed[1] === ':') return out;
      rest = rest.slice(closed[0].length).replace(/^(?:and|&)\s+/i, '');
      continue;
    }
    const joined = /^\s+(?:and|&)\s+/i.exec(rest);
    if (!joined) return out;
    rest = rest.slice(joined[0].length);
  }
}

// Who a message opens on: a name that starts a sentence, a line or a list item.
// A quoted line is somebody else's words.
export function addressedByOpening(body: string | null | undefined, people: readonly RoomNamed[]): string[] {
  const names = [...callNames(people)].sort((a, b) => b[0].length - a[0].length);
  const out = new Set<string>();
  for (const line of String(body ?? '').split('\n')) {
    if (/^\s*>/.test(line)) continue;
    for (const sentence of line.replace(LIST_MARK, '').split(/(?<=[.!?])\s+/)) {
      for (const id of openingNames(sentence.trim(), names)) out.add(id);
    }
  }
  return [...out];
}

// The same row for a file in the group: a comment on my file, naming me or
// answering me, or an approval of my file. Opening the file or Mark done ends it.
export function groupFileRow({ roomId, roomName, marks = [], me, myName = null, doneAt = 0, nameOf = () => '' }: {
  roomId: string;
  roomName: string;
  marks?: readonly RoomMarkLike[];
  me: string | null;
  myName?: string | null;
  doneAt?: number;
  nameOf?: NameOf;
}): GroupRow | null {
  if (!marks.length || !me) return null;
  const artifacts = marksOf(marks.map((r) => ({ ...r.mark, by: r.by, ts: r.at })));
  const news = fileNewsFor({ artifacts, people: [me] }, me, { myName }).filter((n) => n.ts > doneAt);
  const newest = news.at(-1);
  if (!newest) return null;
  return {
    id: `room-mention:${roomId}`, messageId: newest.id, roomId, roomName, by: newest.by, byName: nameOf(newest.by),
    body: fileNewsLine(news, () => '')!.trim(), at: newest.ts, thread: null, unread: true,
    note: newest.kind === 'approved' ? null : newest.on ?? newest.id, file: newest.file,
  };
}

// The row a group puts in my Needs you, or null. A message to me opens it; only
// my writing in the group, my comment or approval on a file in it
// (`answeredAt`) or my Mark done (`doneAt`) ends it, never reading.
// It says the group's newest words, so a thread reply moves it and says so.
export function groupRow({ roomId, roomName, messages = [], mentioned = [], me, people = [], doneAt = 0, answeredAt = 0, readAt = 0, nameOf = () => '' }: {
  roomId: string;
  roomName: string;
  messages?: readonly RoomSaid[];
  mentioned?: readonly RoomSaid[];
  me: string | null;
  people?: readonly RoomNamed[];
  doneAt?: number;
  answeredAt?: number;
  readAt?: number;
  nameOf?: NameOf;
}): GroupRow | null {
  const pool = [...new Map([...mentioned, ...messages].map((m) => [m.id, m])).values()].sort((a, b) => a.at - b.at);
  const mine = pool.filter((m) => m.by === me && !m.deleted);
  const settled = Math.max(doneAt, answeredAt, mine.at(-1)?.at ?? 0);
  const myRoots = new Set(mine.filter((m) => !m.inReplyTo).map((m) => m.id));
  const myThreads = new Set([...myRoots, ...mine.map((m) => m.inReplyTo).filter(Boolean)]);
  const fresh = pool.filter((m) => m.by !== me && !m.deleted && m.at > settled);
  type Ids = readonly (string | null)[];
  const toMe = (m: RoomSaid): boolean => ((m.mentions ?? []) as Ids).includes(me) || (mentionsIn(m.body, people) as Ids).includes(me)
    || (addressedByOpening(m.body, people) as Ids).includes(me) || (!!m.inReplyTo && myThreads.has(m.inReplyTo));
  if (!fresh.some(toMe)) return null;
  const newest = fresh.at(-1)!;
  return {
    id: `room-mention:${roomId}`, messageId: newest.id, roomId, roomName, by: newest.by, byName: nameOf(newest.by), body: newest.body, at: newest.at,
    thread: !newest.inReplyTo ? null : myRoots.has(newest.inReplyTo) ? 'yours' : 'theirs',
    unread: newest.at > readAt,
  };
}
