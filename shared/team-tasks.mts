// A TASK'S DEADLINE AND WHAT IT IS BLOCKED ON, read the same way by the Mac
// that publishes a task's card, the window that draws its row, and the team
// sync that clears a block once what it waited on is finished.
//
// A deadline is a day someone picked (`due`) or one said in words ("I need
// yours by 3pm"). Words are read on the reader's clock: nothing records the
// zone the sender typed them in.
//
// A block names something every Mac on the team can look up: a person
// (`person:<id>`) or a thread or task by whoever publishes its card
// (`card:<person>:<thread>`). A bare local id would mean nothing on the other
// Mac, which would read it as gone and clear the block at once.
import { isTaskRow, taskGiver } from './team-rules.mts';
import { waitParts, personWait, cardWait } from './thread-waits.mts';
import { shortTitle, shownTitle } from './thread-title.mts';
import type { TalkLine, TalkRow } from './team-rules.mts';

/** The moment a deadline passes; `clock` is false for a whole day. */
export interface Deadline { at: number; clock: boolean }

/** A row as the deadline and block rules read it. */
export interface TaskRow extends TalkRow {
  title?: string;
  body?: string;
  due?: string;
  blockedBy?: string[];
  visibility?: string;
  updatedAt?: number;
  /** Set on the rows that stand for a running agent, which are never a block. */
  agent?: unknown;
}

/** A card on the team's board, as a block on it is looked up. */
export interface BlockCard { personId?: string; threadId?: string; title?: unknown; state?: string }

/** Whose a block is, its title, and whether it is finished. */
export type Blocker =
  | { kind: 'person'; person: string; title: null; done: false }
  | { kind: 'name'; person: null; title: string; done: false }
  | { kind: 'thread'; person: string | null; title: string | null; done: boolean };

/** What this Mac can look a block up in. */
export interface BlockLookup {
  items?: readonly TaskRow[];
  cards?: readonly BlockCard[];
  me?: string | null;
}

/** What a blocked task says: a short word, the whole of it, and what it is on. */
export interface BlockedWords { word: string; title: string; on: string }

/** What a row says about its deadline. */
export interface DueSaid { word: string; late: boolean }

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY_MS = 24 * HOUR;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfDay = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0);
const daysBetween = (a: number, b: number): number => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);

/* ------------------------------ deadlines ------------------------------ */

const LEAD = /\b(?:by|before|until|till)\s+(?:the\s+)?/gi;
const TIME = /^(?:(noon|midday|midnight)|(\d{1,2})(?::([0-5]\d))?\s?([ap])\.?m\b\.?|([01]?\d|2[0-3]):([0-5]\d)(?!\d))/i;
const DAY = /^(today|tonight|tomorrow|tmrw|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;
const EOD = /^(?:end of (?:the )?day|eod|close of business|cob)\b/i;

interface ClockTime { h: number; m: number }

function timeOf(m: RegExpExecArray): ClockTime | null {
  if (m[1]) return m[1].toLowerCase() === 'midnight' ? { h: 24, m: 0 } : { h: 12, m: 0 };
  if (m[2]) {
    const h = Number(m[2]);
    if (h < 1 || h > 12) return null;
    return { h: (h % 12) + (m[4].toLowerCase() === 'p' ? 12 : 0), m: Number(m[3] ?? 0) };
  }
  return { h: Number(m[5]), m: Number(m[6]) };
}

function dayOffset(word: string, from: number): number {
  const w = word.toLowerCase();
  if (w === 'today' || w === 'tonight') return 0;
  if (w === 'tomorrow' || w === 'tmrw') return 1;
  const target = WEEKDAYS.findIndex((d) => w.startsWith(d.toLowerCase()));
  return (target - new Date(from).getDay() + 7) % 7;
}

/** The first deadline said in some words, as the moment it passes: `{ at, clock }`, clock false for a whole day. */
export function deadlineIn(text: unknown, sentAt: number): Deadline | null {
  if (typeof text !== 'string' || !Number.isFinite(sentAt)) return null;
  for (const lead of text.matchAll(LEAD)) {
    let rest = text.slice(lead.index + lead[0].length);
    let time: ClockTime | null = null; let day: string | null = null;
    const t = TIME.exec(rest);
    if (t) {
      time = timeOf(t);
      if (!time) continue;
      rest = rest.slice(t[0].length).replace(/^\s*,?\s*(?:on\s+|this\s+)?/i, '');
      day = DAY.exec(rest)?.[1] ?? null;
    } else if (DAY.exec(rest)) {
      day = DAY.exec(rest)![1];
      rest = rest.slice(day.length).replace(/^\s+(?:at\s+|by\s+)?/i, '');
      const t2 = TIME.exec(rest);
      if (t2) time = timeOf(t2);
    } else if (EOD.exec(rest)) {
      rest = rest.slice(EOD.exec(rest)![0].length).replace(/^\s+/, '');
      day = DAY.exec(rest)?.[1] ?? 'today';
    } else continue;
    const base = new Date(sentAt);
    const off = day ? dayOffset(day, sentAt) : 0;
    if (!time) return { at: new Date(base.getFullYear(), base.getMonth(), base.getDate() + off + 1).getTime(), clock: false };
    let at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + off, time.h, time.m).getTime();
    // "By 9am" said at 10am is tomorrow's 9am.
    if (!day && at <= sentAt) at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, time.h, time.m).getTime();
    return { at, clock: true };
  }
  return null;
}

/** A picked day is due by the end of it; a picked day and time, at that minute. */
export function dayDeadline(due: string | null | undefined): Deadline | null {
  const m = typeof due === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(due) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  if (m[4]) return { at: new Date(y, mo, d, Number(m[4]), Number(m[5])).getTime(), clock: true };
  return { at: new Date(y, mo, d + 1).getTime(), clock: false };
}

const pad = (n: number): string => String(n).padStart(2, '0');
const dayKeyOf = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** A due typed in words ("tomorrow 10am", "fri", "3pm") as the key the ledger keeps, or null. */
export function dueFromWords(text: string | null | undefined, now: number): string | null {
  const words = String(text ?? '').trim();
  if (!words) return null;
  const d = deadlineIn(`by ${words}`, now);
  if (!d) return null;
  if (!d.clock) return dayKeyOf(d.at - 1);
  const t = new Date(d.at);
  // Midnight is the end of the day it closes.
  if (t.getHours() === 0 && t.getMinutes() === 0) return dayKeyOf(d.at - 1);
  return `${dayKeyOf(d.at)}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

/* -------------------------------- titles -------------------------------- */

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// En and em dash, built from their codes so no dash sits in the source the no-dash check reads.
const DASHES = String.fromCharCode(0x2013, 0x2014);
const END = String.raw`(?:\s*[:,.\-${DASHES}]\s*|\s*\n\s*|\s*$)`;

/** The words with who they are for taken off the front: "Task for Sofia:", "Sofia,", "For Dev -". */
function withoutAddress(text: string, names: readonly (string | null | undefined)[]): string {
  const firsts = [...new Set(names.map((n) => String(n ?? '').trim().split(/\s+/)[0]).filter(Boolean))].map(escape);
  const who = firsts.length ? `(?:${firsts.join('|')})` : null;
  const leads = [String.raw`(?:a\s+|new\s+)?task\s*[:\-${DASHES}]\s*`];
  if (who) leads.unshift(String.raw`(?:(?:a\s+|new\s+)?task\s+)?(?:for|to)\s+@?${who}\b${END}`, String.raw`@?${who}\b${END}`);
  let t = String(text ?? '');
  for (const lead of leads) t = t.replace(new RegExp(`^\\s*${lead}`, 'i'), '');
  return t.trim();
}

const capital = (t: string): string => (t ? t[0].toUpperCase() + t.slice(1) : t);

/**
 * A new task's title: what it asks, never only whom it is for. A title that
 * is only the address ("Task for Sofia") gives way to the words under it.
 */
export function taskTitle(title: string | null | undefined, names: readonly (string | null | undefined)[] = [], words: string | null | undefined = ''): string {
  for (const text of [String(title ?? '').trim(), String(words ?? '').trim()]) {
    if (!text) continue;
    const rest = withoutAddress(text, names);
    if (rest) return capital(shortTitle(rest));
  }
  return capital(shortTitle(String(title ?? '').trim() || String(words ?? '').trim()));
}

const newestDeadline = (said: readonly { text?: string; ts: number }[]): Deadline | null => {
  for (let k = said.length - 1; k >= 0; k -= 1) {
    const d = deadlineIn(said[k].text, said[k].ts);
    if (d) return d;
  }
  return null;
};

/**
 * When a row is due, from where `me` sits. A task: its picked day, else the
 * newest deadline its giver wrote on it. A conversation: the newest deadline in
 * what the others said that still waits on you, because answering is what
 * settles a message.
 */
export function deadlineOf(item: TaskRow | null | undefined, me: string | null): Deadline | null {
  if (!item || item.status === 'done') return null;
  const chat = item.talk?.chat ?? [];
  if (isTaskRow(item)) {
    const picked = dayDeadline(item.due);
    if (picked) return picked;
    const giver = taskGiver(item);
    const theirs = chat.filter((s) => s.by === giver);
    // deadlineIn refuses a row with no createdAt.
    return newestDeadline(theirs.length ? theirs : [{ text: item.body ?? item.title, ts: item.createdAt as number }]);
  }
  if (!me || !item.talk) return null;
  const settled = item.talk.settled?.[me] ?? 0;
  const waiting: TalkLine[] = [];
  for (let k = chat.length - 1; k >= 0 && chat[k].by !== me; k -= 1) if (chat[k].ts > settled) waiting.unshift(chat[k]);
  return newestDeadline(waiting);
}

export const isLate = (deadline: Deadline | null | undefined, now: number): boolean => !!deadline && now >= deadline.at;

/** Past its deadline and yours to act on: a task given to you, or a message waiting on you. */
export function lateForMe(item: TaskRow, me: string | null, now: number): boolean {
  if (!me || (isTaskRow(item) && item.assignee !== me)) return false;
  return isLate(deadlineOf(item, me), now);
}

/** "3pm", "3:30pm", "midnight". */
export function clockWords(at: number): string {
  const d = new Date(at);
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return 'midnight';
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

function lateWords(d: Deadline, now: number): string {
  if (!d.clock) return `${plural(Math.max(1, daysBetween(d.at - 1, now)), 'day')} late`;
  const mins = Math.floor((now - d.at) / MIN);
  if (mins < 60) return `${Math.max(1, mins)} min late`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${plural(hours, 'hour')} late` : `${plural(Math.floor(hours / 24), 'day')} late`;
}

/**
 * What a row says about its deadline: "Due 3pm" or "Due today" on the day,
 * "1 hour late" once it has passed, and nothing before the day unless `ahead`
 * asks for "Due tomorrow", "Due Thu" or "Due Nov 4".
 */
export function dueSaid(deadline: Deadline | null | undefined, now: number, { ahead = false }: { ahead?: boolean } = {}): DueSaid | null {
  if (!deadline) return null;
  if (now >= deadline.at) return { word: lateWords(deadline, now), late: true };
  const last = deadline.at - 1;
  const days = daysBetween(now, last);
  if (days === 0) return { word: deadline.clock ? `Due ${clockWords(deadline.at)}` : 'Due today', late: false };
  if (!ahead) return null;
  const d = new Date(last);
  const word = days === 1 ? 'Due tomorrow' : days < 7 ? `Due ${WEEKDAYS[d.getDay()]}` : `Due ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return { word: deadline.clock ? `${word} ${clockWords(deadline.at)}` : word, late: false };
}

/* -------------------------------- blocks -------------------------------- */

const WORD_MOST = 14;
function shortWords(said: string): string {
  if (said.length <= WORD_MOST) return said;
  const cut = said.slice(0, WORD_MOST + 1).replace(/\s+\S*$/, '');
  return `${cut.length >= 4 ? cut : said.slice(0, WORD_MOST)}…`;
}
const FIRST = (name: string | null | undefined): string => String(name ?? '').trim().split(/\s+/)[0] || 'Someone';

/** The open task's blocks, or none. */
export function taskBlocks(item: TaskRow): string[] {
  if (!isTaskRow(item) || item.status === 'done' || !Array.isArray(item.blockedBy)) return [];
  return item.blockedBy.filter((id) => typeof id === 'string' && /^(?:person|card|name):./.test(id));
}

/** Blocked on you, and you have not written on it since the block was set. */
export function blockedOnMe(item: TaskRow, me: string | null): boolean {
  if (!me || !taskBlocks(item).includes(personWait(me))) return false;
  const since = item.wrote?.blockedBy?.ts ?? 0;
  return !(item.talk?.chat ?? []).some((s) => s.by === me && s.ts > since);
}

/** A block as this Mac can see it: whose it is, its title, and whether it is finished. Unknown is not finished. */
export function blockerOf(id: string, { items = [], cards = [], me = null }: BlockLookup): Blocker {
  const w = waitParts(id);
  if (w.kind === 'person') return { kind: 'person', person: w.person, title: null, done: false };
  if (w.kind === 'name') return { kind: 'name', person: null, title: w.name, done: false };
  if (w.kind !== 'card') return { kind: 'thread', person: null, title: null, done: false };
  const row = items.find((i) => i.id === w.thread && !i.agent);
  if (row && (w.person === me || isTaskRow(row))) return { kind: 'thread', person: w.person, title: shownTitle(row), done: row.status === 'done' };
  const card = cards.find((c) => c.personId === w.person && c.threadId === w.thread);
  return { kind: 'thread', person: w.person, title: (card?.title ?? null) as string | null, done: card?.state === 'done' };
}

/**
 * What a blocked task says: "Blocked on Dev" for a person or a teammate's
 * thread, "Blocked on “Restyle”" for a thread of your own, and the whole of it
 * for the hover. Null when nothing blocks it.
 */
export function blockedWords(item: TaskRow, ctx: BlockLookup & { nameOf: (id: string) => string }): BlockedWords | null {
  const ids = taskBlocks(item);
  if (!ids.length) return null;
  const b = blockerOf(ids[0], ctx);
  const who = b.person && b.person !== ctx.me ? FIRST(ctx.nameOf(b.person)) : null;
  const named = b.title ? `“${b.title}”` : 'a thread';
  if (b.kind === 'person') return { word: `Blocked on ${who ?? 'you'}`, title: `Blocked on ${who ?? 'you'}`, on: who ?? 'you' };
  // The status column is narrow: words past a few are on the hover and the Tasks page.
  if (b.kind === 'name') return { word: `Blocked on ${shortWords(b.title)}`, title: `Blocked on ${b.title}`, on: b.title };
  if (!who) return { word: `Blocked on ${named}`, title: `Blocked on ${named}`, on: named };
  return { word: `Blocked on ${who}`, title: `Blocked on ${who}’s ${named}`, on: `${who}’s ${named}` };
}

/**
 * The blocked tasks you hold whose blocks have all ended, with how. A thread
 * or task ends when it is finished, not when it is answered; a person ends
 * when they write to you. No block gives up after a while, unlike a thread's
 * wait: it is on the row and on the team's list of tasks, so it is never
 * silent.
 */
export function endedTaskBlocks<R extends TaskRow>(rows: readonly R[], { items = [], cards = [], me, lastWordFrom = () => 0, nameOf }: BlockLookup & {
  lastWordFrom?: (person: string) => number;
  nameOf: (id: string) => string;
}): { item: R; said: string }[] {
  const out: { item: R; said: string }[] = [];
  for (const item of rows) {
    if (item.assignee !== me) continue;
    const ids = taskBlocks(item);
    if (!ids.length) continue;
    const since = item.wrote?.blockedBy?.ts ?? 0;
    const ends = ids.map((id) => {
      const b = blockerOf(id, { items, cards, me });
      if (b.kind === 'person') return lastWordFrom(b.person) > since ? `${FIRST(nameOf(b.person))} wrote to you` : null;
      // Nothing here can see words end; whoever holds it says when.
      if (b.kind === 'name' || !b.done) return null;
      return b.person && b.person !== me ? `${FIRST(nameOf(b.person))} finished “${b.title ?? 'their thread'}”` : `“${b.title ?? 'The thread'}” finished`;
    });
    if (ends.every(Boolean)) out.push({ item, said: ends.at(-1)! });
  }
  return out;
}

const CHOICES = 8;

/**
 * What a task can be blocked on: the people other than whoever holds it, then
 * open threads and tasks the holder's Mac can look up, newest first.
 * `published` says whether one of your threads has a card the team can read.
 */
export function blockChoices<T extends TaskRow & { id: string }>({ task = null, holder, me, people, items, cards, nameOf, published }: {
  task?: { id: string } | null;
  holder: string | null;
  me: string | null;
  people: readonly { id: string; name?: string | null }[];
  items: readonly T[];
  cards: readonly { personId: string; threadId: string; visible: boolean; title: string | null; state: string; updatedAt?: number }[];
  nameOf: (id: string) => string;
  published: (item: T) => boolean;
}): { id: string; label: string }[] {
  const humans = people.filter((p) => p.id !== holder).map((p) => ({ id: personWait(p.id), label: p.id === me ? 'You' : FIRST(p.name) }));
  const here = new Set<string>();
  const threads: { id: string; label: string; at: number }[] = [];
  for (const i of items) {
    if (i.agent || i.status === 'done' || i.id === task?.id) continue;
    if (isTaskRow(i)) {
      if (i.visibility !== 'team' || !i.assignee) continue;
      here.add(i.id);
      threads.push({ id: cardWait(i.assignee, i.id), label: `${i.assignee === me ? 'You' : FIRST(nameOf(i.assignee))}: ${shownTitle(i)}`, at: i.updatedAt ?? 0 });
    } else if (published(i)) {
      here.add(i.id);
      // Published means it is on the team's board, which only someone signed in has.
      threads.push({ id: cardWait(me as string, i.id), label: shownTitle(i), at: i.updatedAt ?? 0 });
    }
  }
  for (const c of cards) {
    if (c.personId === me || !c.visible || c.state === 'done' || !c.title || here.has(c.threadId) || c.threadId === task?.id) continue;
    threads.push({ id: cardWait(c.personId, c.threadId), label: `${FIRST(nameOf(c.personId))}: ${c.title}`, at: c.updatedAt ?? 0 });
  }
  return [...humans, ...threads.sort((a, b) => b.at - a.at).slice(0, CHOICES).map(({ id, label }) => ({ id, label }))];
}
