// PURE. What a query finds inside things, as the rows Command K and the search
// page draw: a line in a message, a file, a comment on a file, a decision.
//
// Threads, conversations and teammates' shared threads are searched in main
// (main/everything-found.mjs) and arrive as `found`; lines in groups and
// decisions are already held by the screen and are searched here. A row is
// kept only if the screen can open what it points at, so a result that main
// found for a thread this copy does not list is dropped, not shown dead.
import type { FoundInThreads, FoundWhere, ThreadCard, WorkItem } from './types';
import { fold, firstHit, holds, queryOf, windowAround } from '../../shared/word-match.mjs';
import { parseQuery, splitHits, type Run } from './search';

/** A found line as runs, the typed words marked, drawn the way the thread list draws its own. */
export function markedWords(text: string, query: string): Run[] {
  const q = parseQuery(query);
  return splitHits(text, q.terms, q.phrase);
}

export type InsideGroupKey = 'lines' | 'files' | 'comments' | 'decisions';

/** Where pressing a row goes. `line` is the message to land on; `file` and `note` the file to open big. */
export type InsideOpen =
  | { type: 'thread'; item: WorkItem; line?: string; file?: string; note?: { file: string; id: string } }
  | { type: 'card'; card: ThreadCard; line?: string; file?: string; note?: { file: string; id: string } }
  | { type: 'room'; roomId: string; messageId: string };

export interface InsideRow {
  id: string;
  group: InsideGroupKey;
  /** The matching line, a file's name, or the comment. */
  text: string;
  /** Only for a file found by what it says: the file's name, with the line in `text`. */
  file?: string;
  who: string;
  at: number;
  /** Which thread, conversation or group it sits in. */
  where: string;
  open: InsideOpen;
}

export interface InsideGroup { key: InsideGroupKey; label: string; rows: InsideRow[]; more: number }

type RoomLine = { id: string; roomId: string; by: string | null; body: string; at: number; deleted?: boolean };
type DecisionLike = { roomId: string; messageId: string; kind: 'decision' | 'priority'; body: string; saidBy: string | null; at: number; on: boolean };

export const LABELS: Record<InsideGroupKey, string> = { lines: 'Lines', files: 'Files', comments: 'Comments', decisions: 'Decisions' };
const SNIPPET = 180;

// Folded once per message object, so a keystroke is not a toLowerCase of every
// line said in every group.
const FOLDED = new WeakMap<object, string>();
const foldedBody = (m: RoomLine) => {
  let f = FOLDED.get(m);
  if (f === undefined) { f = fold(m.body); FOLDED.set(m, f); }
  return f;
};

export interface InsideInput {
  query: string;
  found: FoundInThreads;
  items: WorkItem[];
  cards: ThreadCard[];
  /** The rooms you are in, by id, to their names. A group you are not in is not here. */
  rooms: Map<string, string>;
  messages: Record<string, RoomLine[]>;
  decisions: Record<string, DecisionLike[]>;
  me: string | null;
  nameOf: (personId: string) => string;
  /** A thread's name as the list draws it; a conversation with no title is its people's names. */
  titleOf: (item: WorkItem) => string;
  /** How many of each group to keep. */
  limit: Record<InsideGroupKey, number>;
}

export function insideGroups(input: InsideInput): InsideGroup[] {
  const q = queryOf(input.query);
  if (!q.terms.length) return [];
  const byItem = new Map(input.items.map((i) => [`${i.product}/${i.id}`, i]));
  const byCard = new Map(input.cards.map((c) => [`${c.personId}/${c.threadId}`, c]));
  const who = (by: string | null, source: string) => (by ? (by === input.me ? 'You' : input.nameOf(by)) : source === 'agent' ? 'Agent' : 'You');

  // Where a found thing sits, or null when this screen cannot open it.
  const placeOf = (w: FoundWhere): { where: string; at: (extra: { line?: string; file?: string; note?: { file: string; id: string } }) => InsideOpen } | null => {
    if (w.kind === 'shared') {
      const card = byCard.get(`${w.ownerId}/${w.threadId}`);
      if (!card) return null;
      return { where: card.title ?? 'Thread', at: (extra) => ({ type: 'card', card, ...extra }) };
    }
    const item = byItem.get(`${w.product}/${w.id}`);
    if (!item) return null;
    return { where: input.titleOf(item), at: (extra) => ({ type: 'thread', item, ...extra }) };
  };

  const lines: InsideRow[] = [];
  for (const l of input.found.lines) {
    const place = placeOf(l);
    if (!place) continue;
    lines.push({ id: `line-${l.kind}-${l.product ?? l.ownerId}-${l.id ?? l.threadId}-${l.uid}`, group: 'lines', text: l.text, who: l.comment ? `${who(l.by, l.source)} commented` : who(l.by, l.source), at: l.at, where: place.where, open: place.at({ line: l.uid }) });
  }
  for (const [roomId, said] of Object.entries(input.messages)) {
    const name = input.rooms.get(roomId);
    if (!name) continue;
    for (const m of said) {
      if (m.deleted || !m.body) continue;
      const f = foldedBody(m);
      if (!holds(f, q)) continue;
      lines.push({ id: `line-room-${roomId}-${m.id}`, group: 'lines', text: windowAround(m.body, firstHit(f, q), SNIPPET), who: m.by ? who(m.by, 'founder') : 'Someone', at: m.at, where: name, open: { type: 'room', roomId, messageId: m.id } });
    }
  }

  const files: InsideRow[] = [];
  for (const f of input.found.files) {
    const place = placeOf(f);
    if (!place) continue;
    files.push({
      id: `file-${f.kind}-${f.product ?? f.ownerId}-${f.id ?? f.threadId}-${f.src}`, group: 'files',
      text: f.how === 'name' ? f.name : f.text, ...(f.how === 'contents' ? { file: f.name } : {}),
      who: f.by ? who(f.by, 'founder') : '', at: f.at, where: place.where, open: place.at({ file: f.src }),
    });
  }

  const comments: InsideRow[] = [];
  for (const c of input.found.comments) {
    const place = placeOf(c);
    if (!place) continue;
    comments.push({
      id: `comment-${c.kind}-${c.product ?? c.ownerId}-${c.id ?? c.threadId}-${c.noteId}`, group: 'comments', text: c.text, file: c.name,
      who: c.by ? who(c.by, 'founder') : '', at: c.at, where: place.where, open: place.at({ file: c.src, note: { file: c.fileId, id: c.noteId } }),
    });
  }

  const decisions: InsideRow[] = [];
  for (const marked of Object.values(input.decisions)) {
    for (const d of marked) {
      const roomId = d.roomId;
      const name = input.rooms.get(roomId);
      if (!name || !d.on || !d.body) continue;
      const f = fold(d.body);
      if (!holds(f, q)) continue;
      decisions.push({
        id: `decision-${roomId}-${d.messageId}`, group: 'decisions', text: windowAround(d.body, firstHit(f, q), SNIPPET),
        who: d.saidBy ? who(d.saidBy, 'founder') : '', at: d.at, where: d.kind === 'priority' ? `${name}, this week's priorities` : name, open: { type: 'room', roomId, messageId: d.messageId },
      });
    }
  }

  const newest = (a: InsideRow, b: InsideRow) => b.at - a.at;
  const made = (key: InsideGroupKey, rows: InsideRow[]): InsideGroup[] => {
    const sorted = key === 'files' ? rows : [...rows].sort(newest);
    const kept = sorted.slice(0, input.limit[key]);
    return kept.length ? [{ key, label: LABELS[key], rows: kept, more: Math.max(0, moreOf(key, sorted.length) - kept.length) }] : [];
  };
  // Main counts what it found beyond what it sent, which the rows here cannot see.
  const moreOf = (key: InsideGroupKey, own: number) => {
    const sentByMain = key === 'lines' ? input.found.lines.length : key === 'files' ? input.found.files.length : key === 'comments' ? input.found.comments.length : 0;
    const totalInMain = key === 'lines' ? input.found.total.lines : key === 'files' ? input.found.total.files : key === 'comments' ? input.found.total.comments : 0;
    return own + Math.max(0, totalInMain - sentByMain);
  };
  return [...made('lines', lines), ...made('files', files), ...made('comments', comments), ...made('decisions', decisions)];
}
