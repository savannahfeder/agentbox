// Teammates: the pure rules, shared by the main process, the store tools and
// the renderer, the way shared/repeats.mts is.
//
// A teammate is a standing job, not a thread. Each time it wakes it works on an
// ordinary work item labelled `teammate:<id>`, so every rule about runs (held
// starts, Needs you, deadlines, the clean marker) applies to it unchanged.
// What is new lives in two append-only files per account: the teammates
// themselves, and one team chat that you and every teammate write to.
import { periodKey, isRepeatRule, servedOf, dateKey, clockLabel, DAY_NAMES } from './repeats.mts';
import type { RepeatShape } from './repeats.mts';

/** Anything that carries labels, which is where a run says whose it is. */
export interface Labelled { id?: string; labels?: readonly string[] }

/** Who wrote a field's surviving value, and when. */
export interface Written { source?: string; ts: number }

/** A work item as the teammate rules read it. */
export interface RunItem {
  id: string;
  product: string;
  status?: string;
  labels?: readonly string[];
  title?: string;
  label?: string;
  answer?: string | null;
  result?: string;
  note?: string;
  start?: string;
  createdAt?: number;
  updatedAt?: number;
  wrote?: Partial<Record<'note' | 'result' | 'answer' | 'status' | 'start' | 'labels', Written>>;
}

export type DutyEvery = 'day' | 'weekday' | 'week';

/** Something a teammate does on its own, as cleanDuty keeps it. */
export type Duty =
  | { id: string; what: string; after: 'ship'; most?: number; tell?: string }
  | { id: string; what: string; every: DutyEvery; at: string[]; on?: number; tell?: string };

/** A duty as the rules read it, whichever kind it is. */
export interface DutyLike {
  id: string;
  what: string;
  tell?: string | null;
  after?: string;
  most?: number;
  every?: DutyEvery;
  at?: readonly string[];
  on?: number;
}

/** Something a teammate was told to keep. */
export interface Memory { id: string; text: string; from: string | null; at: number; by: string | null }

export type TeammateStatusWord = 'draft' | 'active';

/** 'owed' from going ready until its first run starts, then 'served'; 'waits' for its first duty's time. */
export type FirstRun = 'owed' | 'served' | 'waits';
const FIRST_RUNS: readonly FirstRun[] = ['owed', 'served', 'waits'];

/** A teammate as its file folds. */
export interface Teammate {
  id: string;
  name: string;
  letter?: string | null;
  role?: string | null;
  job?: string | null;
  goal?: string | null;
  counted?: string | null;
  asksFirst?: string | null;
  works?: RepeatShape | null;
  product?: string | null;
  engine?: string | null;
  model?: string | null;
  effort?: string | null;
  limit: number;
  status: TeammateStatusWord;
  starter?: string | null;
  primary?: boolean;
  voice?: string | null;
  voiceText?: string | null;
  readsMessages?: boolean;
  openToTeam?: boolean;
  paused: boolean;
  pausedUntil?: string | null;
  handoffsNeedYes?: boolean;
  firstRun?: FirstRun;
  createdAt: number;
  updatedAt: number;
  endedAt?: number | null;
  served: string;
  memory: Memory[];
  duties: Duty[];
  dutyServed: Record<string, string>;
}

/** A teammate as the waking rules read it. */
export interface TeammateLike {
  id: string;
  name?: string;
  product?: string | null;
  limit?: number;
  status?: string;
  paused?: boolean;
  pausedUntil?: string | null;
  endedAt?: number | null;
  handoffsNeedYes?: boolean;
  firstRun?: string;
  works?: unknown;
  served?: string;
  duties?: readonly DutyLike[];
  dutyServed?: Record<string, string>;
}

export const TEAMMATE_LABEL_PREFIX = 'teammate:';
export const FROM_LABEL_PREFIX = 'from:';
export const YOU = 'you';
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_LIMIT = 20;
export const CHAT_TAIL = 30;
// Teammates waking each other with no person or schedule in between stop after
// this many hops, so two of them cannot keep each other running.
export const MAX_HOPS = 8;

// Teammates are an alpha feature (Settings, Alpha features): off unless switched on.
export function teammatesOn(config: { alphaTeammates?: unknown } | null | undefined): boolean {
  return config?.alphaTeammates === true;
}
export const HOP_LABEL_PREFIX = 'hop:';

export function hopOf(item: Labelled | null | undefined): number {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(HOP_LABEL_PREFIX));
  const n = found ? Number(found.slice(HOP_LABEL_PREFIX.length)) : 0;
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function teammateLabel(id: string): string {
  return `${TEAMMATE_LABEL_PREFIX}${id}`;
}

export function teammateIdOf(item: Labelled | null | undefined): string | null {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(TEAMMATE_LABEL_PREFIX));
  return found ? found.slice(TEAMMATE_LABEL_PREFIX.length) : null;
}

export function passedFromOf(item: Labelled | null | undefined): string | null {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(FROM_LABEL_PREFIX));
  return found ? found.slice(FROM_LABEL_PREFIX.length) : null;
}

// WHICH OF YOUR WORK A RUN IS ON: the thread of yours it came from, carried on
// by every hand-off made from it. A run with no label is its own work.
export const WORK_LABEL_PREFIX = 'work:';
export function workOf(item: { id: string; labels?: readonly string[] }): string;
export function workOf(item: Labelled | null | undefined): string | null;
export function workOf(item: Labelled | null | undefined): string | null {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(WORK_LABEL_PREFIX));
  return found ? found.slice(WORK_LABEL_PREFIX.length) : item?.id ?? null;
}

const ID_RE = /^t-[0-9a-f]{6,}$/;
export function isTeammateId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

// ---------------------------------------------------------------- teammates

// A field written and missing from here is folded away at the next start, the
// way `on` once vanished from every weekly repeating task.
const FIELDS: readonly string[] = [
  'name', 'letter', 'role', 'job', 'goal', 'counted', 'works', 'asksFirst',
  'product', 'engine', 'model', 'effort', 'limit', 'paused', 'status',
  'endedAt', 'served', 'starter', 'createdAt', 'duties', 'dutyServed',
  // Work another teammate hands it waits for your yes before it starts,
  // unless this is saved false.
  'handoffsNeedYes',
  // A date its duties and rounds do not wake it before.
  'pausedUntil',
  // The one you talk to: takes what Auto cannot place, and checks in.
  'primary',
  // Its owner's choices, off until said: it may read their direct messages; and
  // anyone on the team may give it work, rather than asking its owner.
  'readsMessages', 'openToTeam',
  'voice', 'voiceText',
  // 'owed' from going ready until its first run starts, then 'served'; 'waits'
  // when its owner said to start at its first duty's time.
  'firstRun',
];

export const STATUSES: readonly TeammateStatusWord[] = ['draft', 'active'];

/** How a teammate sounds, with a sample of it. */
export interface Voice { id: string; label: string; says: string; sample?: string }

// How each teammate sounds, so a team of them does not read as one writer. Every
// sample says the same thing, so picking between them shows the difference.
export const VOICES: (Voice & { sample: string })[] = [
  { id: 'blunt', label: 'Blunt', says: 'Blunt. The point in your first words, then stop. Fragments are fine. No warm-up, no softening, no sign-off, no "I".', sample: 'Deploy failed. Bad migration. Fixing it now.' },
  { id: 'warm', label: 'Warm', says: 'Warm and easy, like a friend at work. Use their first name, say "hey", give credit when it is earned, write the way you talk. Never gushing.', sample: 'Hey Maya, small snag with the deploy. I\'m on it, nothing you need to do.' },
  { id: 'dry', label: 'Dry', says: 'Dry. Short flat statements, names and numbers, no reassurance, and a straight-faced aside about the absurd part of the situation. Never "I think", never an exclamation mark.', sample: 'The deploy failed, third time today. Same migration. It has commitment.' },
  { id: 'careful', label: 'Careful', says: 'Careful. Say what you know, then what you do not, and how sure you are. Hedge only with a reason, and never claim more than you checked.', sample: 'The deploy failed. It looks like the migration, but I haven\'t confirmed that yet.' },
  { id: 'curious', label: 'Curious', says: 'Curious. Say what you noticed, then ask the one question that matters. You sound interested, and you end on the question when there is one.', sample: 'The deploy failed on a migration nobody touched since June. Who ran it last?' },
];

export const VOICE_WORDS_MOST = 300;

type Voiced = { id?: string; voice?: string | null; voiceText?: string | null } | null | undefined;

export function voiceOf(t: Voiced): Voice {
  const own = typeof t?.voiceText === 'string' ? t.voiceText.trim() : '';
  if (own) return { id: 'own', label: 'Your own', says: own };
  const given = VOICES.find((v) => v.id === t?.voice);
  if (given) return given;
  let h = 0;
  for (const c of String(t?.id ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return VOICES[h % VOICES.length];
}

// Over this a chat message is refused. Real ones ran to 291 before any limit.
export const CHAT_MOST = 500;

export function tooLongForAChat(words: unknown): string | null {
  const n = String(words ?? '').length;
  return n > CHAT_MOST
    ? `That is ${n} characters, and a chat message stops at ${CHAT_MOST}. Nothing was sent. Say it in a line or two, or several short messages, or put it in a document and send one sentence with it attached.`
    : null;
}

/** The part of a teammate's brief on how it writes to people. */
export function howYouWrite(t: Voiced): string {
  return [
    '## How you write',
    '- In a chat (team_post, team_tell) write the way a good colleague writes in Slack: a line or two, then stop. One or two short sentences, usually under 150 characters.',
    '- Answer what was asked with the smallest true answer. Leave out what they already know and anything they did not ask.',
    '- Several short messages beat one long one. Two separate things are two calls, and only if each is worth a ping.',
    '- Ask one thing at a time. Lead with the news or the ask. Do not restate what you were asked, and do not end by offering more help.',
    '- No headings, bold or lists in a chat, and no labels like "Status:". Plain sentences, contractions, the words you would say out loud.',
    `- A long answer (a plan, a draft, a table, more than about three facts) goes in a document: write it, then send one sentence saying what it is or what you need, with the document attached (\`document\` on team_post, \`files\` on team_tell). It shows as a card. A chat message over ${CHAT_MOST} characters is refused.`,
    '- When there is more they did not ask for, offer it in a few words ("want the full list?") rather than writing it.',
    `- Your voice: ${voiceOf(t).says}${voiceOf(t).sample ? ` Told a deploy failed, you would say: "${voiceOf(t).sample}"` : ''} Your first words and your rhythm should sound like this every time. Another teammate given the same news would not write your sentence.`,
  ].join('\n');
}

/** Last in a teammate's system prompt, so the chat rules in howYouWrite do not reach the message that ends its run. */
export function howYourRunEnds(): string {
  return [
    '## Your last message on this thread',
    'The message that ends your run is written like any agent thread\'s last message, by the rules above: the bold line first, then plain sentences, then `## Options` when there is something to decide. Write it in your voice.',
    'The short chat rules under How you write are for team_post and team_tell, not for this message.',
  ].join('\n');
}

export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00`));

/** The primary teammate, while it is set up and working, or null. */
export function primaryOf<T extends { primary?: boolean; endedAt?: number | null; paused?: boolean; status?: string }>(team: readonly T[] | null = []): T | null {
  return (team ?? []).find((t) => t?.primary && !t.endedAt && !t.paused && (t.status ?? 'active') === 'active') ?? null;
}

export function pausedNow(t: { pausedUntil?: string | null } | null | undefined, now = Date.now()): boolean {
  return isDate(t?.pausedUntil) && dateKey(now) < t.pausedUntil;
}

export function isWorks(works: unknown): works is RepeatShape {
  return isRepeatRule(works);
}

// ---------------------------------------------------------------- duties
// What a teammate does on its own, each with its own times or "after a ship"
// in its project. A teammate with only the older single `works` schedule has
// none, and its round runs as before.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EVERY_DUTY: readonly unknown[] = ['day', 'weekday', 'week'];

/** A duty as somebody wrote it; cleanDuty checks every field before it keeps one. */
interface DutyIn { id?: unknown; what?: unknown; tell?: unknown; after?: unknown; most?: unknown; every?: unknown; at?: unknown; on?: unknown }

export function cleanDuty(d: DutyIn | null | undefined): Duty | null {
  if (!d || typeof d !== 'object') return null;
  const id = typeof d.id === 'string' && /^d-[\w-]{1,40}$/.test(d.id) ? d.id : null;
  const what = cleanText(d.what, 300);
  if (!id || !what) return null;
  const tell = cleanText(d.tell, 300);
  if (d.after === 'ship') {
    const most = Number.isInteger(d.most) && (d.most as number) >= 1 && (d.most as number) <= 14 ? d.most as number : null;
    return { id, what, after: 'ship', ...(most ? { most } : {}), ...(tell ? { tell } : {}) };
  }
  const at = (Array.isArray(d.at) ? d.at : [d.at]).filter((x) => typeof x === 'string' && TIME.test(x));
  if (!EVERY_DUTY.includes(d.every) || !at.length || at.length !== (Array.isArray(d.at) ? d.at : [d.at]).length) return null;
  if (d.every === 'week' && !(Number.isInteger(d.on) && (d.on as number) >= 0 && (d.on as number) <= 6)) return null;
  return { id, what, every: d.every as DutyEvery, at: [...new Set(at as string[])].sort().slice(0, 6), ...(d.every === 'week' ? { on: d.on as number } : {}), ...(tell ? { tell } : {}) };
}

const TIMES_WORD = ['', 'once', 'twice', 'three times', 'four times', 'five times'];

/** When a duty runs, in plain words: "Daily at 9:00am and 3:00pm", "After a ship, at most twice a week". */
export function dutyWhen(d: DutyLike): string {
  if (d?.after === 'ship') return d.most ? `After a ship, at most ${TIMES_WORD[d.most] ?? `${d.most} times`} a week` : 'After a ship';
  const at = (Array.isArray(d?.at) ? d.at : []).map((x) => clockLabel(x));
  if (!at.length) return '';
  const times = at.length === 1 ? at[0] : `${at.slice(0, -1).join(', ')} and ${at.at(-1)}`;
  if (d.every === 'day') return `Daily at ${times}`;
  if (d.every === 'weekday') return `Weekdays at ${times}`;
  return `${DAY_NAMES[d.on as number]}s at ${times}`;
}

/** The latest time slot of a timed duty that has come, as "YYYY-MM-DDTHH:MM", or null before the first. */
export function dutySlot(d: DutyLike, now = Date.now()): string | null {
  let best: string | null = null;
  for (const at of d.at ?? []) {
    const key = periodKey({ every: d.every, at, ...(d.every === 'week' ? { on: d.on } : {}) }, now);
    if (!key) continue;
    const slot = `${key}T${at}`;
    if (!best || slot > best) best = slot;
  }
  return best;
}

/** What a duty has seen so far when it is set, so a time or a ship already past fires nothing. */
export function dutyStart(d: DutyLike, now = Date.now()): string {
  return d.after === 'ship' ? `ship@${now}` : dutySlot(d, now) ?? '';
}

export const DUTY_LABEL_PREFIX = 'duty:';

// What needs the person's yes first, as a rule. A question saved there is not
// one (setup refuses it now; older teammates may still carry one).
export function yesFirst(asksFirst: string | null | undefined): string | null {
  const rule = String(asksFirst ?? '').trim();
  return rule && !rule.endsWith('?') ? rule : null;
}
// A run your own words in a teammate's chat woke. You are in that chat
// waiting for its answer, so it is next for a free agent.
export const CHAT_LABEL = 'from-chat';
export const dutyOf = (item: Labelled | null | undefined): string | null => (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(DUTY_LABEL_PREFIX))?.slice(DUTY_LABEL_PREFIX.length) ?? null;

function cleanText(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function coerce(field: string, value: unknown): unknown {
  switch (field) {
    case 'name': return cleanText(value, 40);
    case 'role': return cleanText(value, 60);
    case 'letter': {
      const t = cleanText(value, 2);
      return t ? t.toUpperCase() : null;
    }
    case 'job': case 'goal': case 'counted': case 'asksFirst': return cleanText(value, 2000);
    case 'product': case 'engine': case 'model': case 'effort': case 'starter': return cleanText(value, 120);
    case 'works': return value === null ? null : isWorks(value) ? { every: value.every, at: value.at, ...(value.every === 'week' ? { on: value.on } : {}) } : undefined;
    case 'limit': return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 500 ? value : undefined;
    case 'paused': case 'handoffsNeedYes': case 'primary': case 'readsMessages': case 'openToTeam': return !!value;
    case 'status': return (STATUSES as readonly unknown[]).includes(value) ? value : undefined;
    case 'voice': return value === null ? null : VOICES.some((v) => v.id === value) ? value : undefined;
    case 'voiceText': return value === null ? null : cleanText(value, VOICE_WORDS_MOST);
    case 'endedAt': case 'createdAt': return Number.isFinite(value) ? value : value === null ? null : undefined;
    case 'firstRun': return (FIRST_RUNS as readonly unknown[]).includes(value) ? value : undefined;
    case 'served': return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
    case 'pausedUntil': return value === null ? null : isDate(value) ? value : undefined;
    case 'duties': return Array.isArray(value) ? value.map(cleanDuty).filter(Boolean).slice(0, 12) : value === null ? [] : undefined;
    case 'dutyServed': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(value)) if (/^d-[\w-]{1,40}$/.test(k) && typeof v === 'string' && v.length <= 40) out[k] = v;
      return out;
    }
    default: return undefined;
  }
}

/** One line of the teammates file as it was written; the fold checks each field before it uses one. */
interface TeammateLineIn {
  id?: unknown;
  ts: number;
  patch?: Record<string, unknown> & { remember?: { id?: unknown; text?: unknown; from?: unknown; at: number; by?: unknown } | null };
}

/** A teammate while its lines fold: the name may come in a later line. */
type Folding = Omit<Teammate, 'name'> & { name?: string };

// Newest wins per field. Memory is a list, written as `remember`/`forget` lines
// so two runs learning at once both keep what they learned.
export function foldTeammates(lines: readonly unknown[] | null | undefined, now = Date.now()): Teammate[] {
  const today = dateKey(now);
  const byId = new Map<string, Folding>();
  for (const line of (lines ?? []) as readonly (TeammateLineIn | null)[]) {
    if (!line || typeof line !== 'object') continue;
    const { id, ts, patch } = line;
    if (!isTeammateId(id) || !Number.isFinite(ts) || !patch || typeof patch !== 'object') continue;
    let t = byId.get(id);
    if (!t) {
      t = { id, createdAt: ts, updatedAt: ts, status: 'active', paused: false, served: '', memory: [], limit: DEFAULT_LIMIT, duties: [], dutyServed: {} };
      byId.set(id, t);
    }
    t.updatedAt = Math.max(t.updatedAt, ts);
    for (const field of FIELDS) {
      if (!(field in patch)) continue;
      const v = coerce(field, patch[field]);
      if (v === undefined) continue;
      if (field === 'served') {
        if ((v as string) <= today && (v as string) > t.served) t.served = v as string;
        continue;
      }
      // What each duty has served is kept per duty, so two runs marking two
      // duties at once both land.
      if (field === 'dutyServed') {
        t.dutyServed = { ...(t.dutyServed ?? {}), ...(v as Record<string, string>) };
        continue;
      }
      (t as Record<string, unknown>)[field] = v;
    }
    const r = patch.remember;
    if (r && typeof r === 'object' && typeof r.id === 'string' && cleanText(r.text, 300) && !t.memory.some((m) => m.id === r.id)) {
      t.memory.push({ id: r.id, text: cleanText(r.text, 300)!, from: cleanText(r.from, 300), at: Number.isFinite(r.at) ? r.at : ts, by: typeof r.by === 'string' ? r.by : null });
    }
    if (typeof patch.forget === 'string') t.memory = t.memory.filter((m) => m.id !== patch.forget);
  }
  return ([...byId.values()]
    .filter((t) => !t.endedAt && t.name) as Teammate[])
    .sort((a, b) => a.createdAt - b.createdAt);
}

// A free letter for a new teammate: its own initial when nobody has it, else
// the next letter of its name, else the first free one.
export function letterFor(name: string | null | undefined, teammates: readonly { letter?: string | null }[] = []): string {
  const taken = new Set(teammates.map((t) => t.letter).filter(Boolean));
  const letters = String(name ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  for (const ch of letters) if (!taken.has(ch)) return ch;
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!taken.has(ch)) return ch;
  return letters[0] ?? '?';
}

// ---------------------------------------------------------------- playbooks
// What the person taught their teammates about one kind of work, by topic, so
// every teammate doing that work reads the same lessons. Lines: `book` (made),
// `lesson` (added, by a teammate, from a thread), `reader` (a teammate reads
// it), `forget` (a lesson taken out).
/** A lesson in a playbook, and the thread it was learned from. */
export interface Lesson { id: string; text: string; ts: number; by: string | null; from: { product: string; id: string; title: string } | null }

/** What the person taught their teammates about one kind of work. */
export interface Playbook { id: string; title: string; readers: string[]; lessons: Lesson[]; updatedAt: number }

/** One line of the playbooks file as it was written; the fold checks each field before it uses one. */
interface PlaybookLineIn {
  kind?: unknown;
  id: string;
  ts: number;
  book: string;
  title?: unknown;
  text?: unknown;
  by?: unknown;
  teammate?: unknown;
  from?: { product?: unknown; id?: unknown; title?: unknown } | null;
}

export function foldPlaybooks(lines: readonly unknown[] | null | undefined): Playbook[] {
  const books = new Map<string, Playbook>();
  const lessonBook = new Map<string, Playbook>();
  for (const line of (lines ?? []) as readonly (PlaybookLineIn | null)[]) {
    if (!line || typeof line !== 'object' || !Number.isFinite(line.ts)) continue;
    if (line.kind === 'book' && typeof line.id === 'string' && cleanText(line.title, 120)) {
      const had = books.get(line.id);
      if (had) { had.title = cleanText(line.title, 120)!; had.updatedAt = Math.max(had.updatedAt, line.ts); continue; }
      books.set(line.id, { id: line.id, title: cleanText(line.title, 120)!, readers: [], lessons: [], updatedAt: line.ts });
      continue;
    }
    const book = books.get(line.book);
    if (line.kind === 'lesson' && book && typeof line.id === 'string' && cleanText(line.text, 400) && !book.lessons.some((l) => l.id === line.id)) {
      const from = line.from && typeof line.from === 'object' && typeof line.from.id === 'string'
        ? { product: String(line.from.product ?? ''), id: line.from.id, title: cleanText(line.from.title, 200) ?? '' } : null;
      book.lessons.push({ id: line.id, text: cleanText(line.text, 400)!, ts: line.ts, by: typeof line.by === 'string' ? line.by : null, from });
      lessonBook.set(line.id, book);
      if (isTeammateId(line.by) && !book.readers.includes(line.by)) book.readers.push(line.by);
      book.updatedAt = Math.max(book.updatedAt, line.ts);
    } else if (line.kind === 'reader' && book && isTeammateId(line.teammate) && !book.readers.includes(line.teammate)) {
      book.readers.push(line.teammate);
      book.updatedAt = Math.max(book.updatedAt, line.ts);
    } else if (line.kind === 'forget' && lessonBook.has(line.id)) {
      const b = lessonBook.get(line.id)!;
      b.lessons = b.lessons.filter((l) => l.id !== line.id);
      b.updatedAt = Math.max(b.updatedAt, line.ts);
    }
  }
  return [...books.values()];
}

// ---------------------------------------------------------------- the chat

export type ChatKind = 'msg' | 'pass' | 'seen' | 'act';

export const CHAT_KINDS: readonly ChatKind[] = ['msg', 'pass', 'seen', 'act'];

/** A message, hand-off or note in the team chat. */
export interface ChatLine {
  id: string;
  kind: Exclude<ChatKind, 'seen'>;
  from: string;
  /** Who it names: a list on a message, one teammate on a pass. */
  to?: string | string[];
  text?: string;
  ts: number;
  title?: string;
  details?: string;
  product?: string;
  fromName?: string;
  setup?: boolean;
  start?: boolean;
  fresh?: boolean;
  yours?: boolean;
  hop?: number;
  via?: string;
  viaProduct?: string | null;
  work?: string;
  run?: string;
  verb?: string;
  ref?: string;
  /** The threads a new teammate is made from, on the words that set it up. */
  threads?: { product?: string; id: string; title?: string }[];
  /** A teammate's question offers these answers to tap. */
  options?: string[];
  /** On your message: the answer it gives each of a teammate's questions, by question id. */
  answers?: Record<string, string>;
  /** A document that goes with the words, drawn as a card to open. */
  doc?: { product: string; src: string; name: string };
  /** The project the files it links were saved in. */
  filesIn?: string;
  /** On your message: the priority of the run it starts or joins. */
  priority?: number;
}

/** A message read into a run, and when. */
export interface SeenInto { ref: string; for: string; ts: number }

/** The team chat as it folds. */
export interface TeamChat {
  messages: ChatLine[];
  seen: Set<string>;
  /** Run id to the messages read into it. */
  into: Map<string, SeenInto[]>;
}

/** One line of the chat file as it was written; the fold checks each field before it uses one. */
interface ChatLineIn { kind?: unknown; id?: unknown; ts: number; ref?: unknown; for?: unknown; run?: unknown }

export function foldChat(lines: readonly unknown[] | null | undefined): TeamChat {
  const messages: ChatLine[] = [];
  const seen = new Set<string>();
  // Run id to the messages read into it, and when.
  const into = new Map<string, SeenInto[]>();
  const ids = new Set<string>();
  for (const line of (lines ?? []) as readonly (ChatLineIn | null)[]) {
    if (!line || typeof line !== 'object' || !(CHAT_KINDS as readonly unknown[]).includes(line.kind)) continue;
    if (!Number.isFinite(line.ts)) continue;
    if (line.kind === 'seen') {
      if (typeof line.ref === 'string' && typeof line.for === 'string') {
        seen.add(seenKey(line.ref, line.for));
        if (typeof line.run === 'string') {
          if (!into.has(line.run)) into.set(line.run, []);
          into.get(line.run)!.push({ ref: line.ref, for: line.for, ts: line.ts });
        }
      }
      continue;
    }
    if (typeof line.id !== 'string' || ids.has(line.id)) continue;
    ids.add(line.id);
    messages.push(line as ChatLine);
  }
  messages.sort((a, b) => a.ts - b.ts);
  return { messages, seen, into };
}

export function seenKey(msgId: string, teammateId: string): string {
  return `${msgId}>${teammateId}`;
}

// Who a message is addressed to: the ones it names with @, matched on name.
export function mentionsIn(text: string | null | undefined, teammates: readonly { id: string; name?: string | null }[] = []): string[] {
  const out: string[] = [];
  const lower = String(text ?? '').toLowerCase();
  for (const t of teammates) {
    if (!t.name) continue;
    const re = new RegExp(`(^|[^\\w])@${t.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(lower)) out.push(t.id);
  }
  return out;
}

// ---------------------------------------------------------------- runs

export function runsOf<T extends Labelled>(teammateId: string, items: readonly T[] | null | undefined): T[] {
  return (items ?? []).filter((i) => teammateIdOf(i) === teammateId);
}

// A finished word from the agent that the person has not answered: the run is
// waiting on them, and so in Needs you, not running.
export function waitingOnYou(item: RunItem | null | undefined): boolean {
  if (!item || item.status === 'done' || item.status === 'claimed') return false;
  // Queued behind another run, or closed quietly: neither is in your inbox.
  if (item.start === 'later' || (item.labels ?? []).includes('clean')) return false;
  if (item.status === 'blocked') return true;
  const r = item.wrote?.result;
  if (!r || r.source !== 'agent') return false;
  const a = item.wrote?.answer?.ts ?? 0;
  return r.ts > a;
}

// Whether a teammate's last word asks you anything: a question, or options to
// pick from. A plain answer is said in the chat and asks nothing back.
export function asksSomething(text: string | null | undefined): boolean {
  const t = String(text ?? '');
  if (/^#{1,6}\s*options\b/im.test(t)) return true;
  return /\?(?=["'”’)\]*_`]*(\s|$))/.test(t);
}

// A question, options, or a guess it will act on until you say otherwise. Asked
// of a setup's last answer, where a guess with no question mark is the most
// common way to leave something for you.
const LEFT_OPEN = [
  /\b(until|unless) you (tell|say|let|give|send|confirm|decide|correct)\b/,
  /\b(tell|let) me otherwise\b/,
  /\bassum(e|ed|ing|ption)\b/,
  /\b(can't|cannot|couldn't|could not|didn't|did not) find\b/,
  /\bif (that's|this is|that is) (wrong|not right)\b/,
];
export function leavesSomethingOpen(text: string | null | undefined): boolean {
  const t = String(text ?? '').replace(/[‘’]/g, "'").toLowerCase();
  return asksSomething(t) || LEFT_OPEN.some((re) => re.test(t));
}

const SAY_CLOSED_MS = 60 * 60_000;

function questionsIn(text: unknown): string[] {
  return (String(text ?? '').match(/[^.!?\n]*\?(?=["'”’)\]*_`]*(\s|$))/g) ?? []).map((q) => q.trim()).filter(Boolean);
}

// The chat message that carries a run's answer, one per run, so writing it
// again after a crash adds nothing (`foldChat` keeps the first of an id).
export const replyMessageId = (runId: string): string => `m-reply-${runId}`;

const bareWords = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// The one project your words name, by its name or its folder name, else null.
// A one-word name needs "project" or "repo" beside it, so "git status" does not
// name a project called Git.
export function projectNamedIn(text: string | null | undefined, products: readonly { slug: string; name?: string | null }[] = []): string | null {
  const said = ` ${bareWords(text)} `;
  const hits = new Set<string>();
  for (const p of products) {
    for (const n of [p.name, p.slug]) {
      const w = bareWords(n);
      if (!w) continue;
      const found = w.includes(' ')
        ? said.includes(` ${w} `)
        : new RegExp(` (project|repo|repository) ${w} | ${w} (project|repo|repository) `).test(said);
      if (found) hits.add(p.slug);
    }
  }
  return hits.size === 1 ? [...hits][0] : null;
}

const toNames = (to: string | string[] | undefined): string[] => (Array.isArray(to) ? to : to ? [to] : []);

// A teammate's question in the chat, with answers to tap, asked on this run and
// not answered by any word of yours to it since.
function openQuestionOn(item: RunItem, tid: string, chat: ChatLike, except: string | null = null): boolean {
  const msgs = chat?.messages ?? [];
  return msgs.some((q) => q.kind === 'msg' && q.from === tid && q.run === item.id && q.options?.length
    && !msgs.some((m) => m.kind === 'msg' && m.from === YOU && m.id !== except && m.ts > q.ts && toNames(m.to).includes(tid)));
}

// A waiting run your next words answer: one that asked you something. A run
// that only answered is finished talking, and your next words are new work.
function asksYouStill(item: RunItem, tid: string, chat: ChatLike, except: string | null = null): boolean {
  return item.status === 'blocked' || asksSomething(item.result) || openQuestionOn(item, tid, chat, except)
    || (isSetupRun(item, tid, chat) && leavesSomethingOpen(item.result));
}

// A run whose question reached you in the chat, so your next chat words can be
// its answer. A run made by a duty or a hand-off asks in its own thread, and
// chat words to its teammate are new work.
function talksInChat(item: RunItem, tid: string, chat: ChatLike, except: string | null): boolean {
  return (item.labels ?? []).includes(CHAT_LABEL) || openQuestionOn(item, tid, chat, except) || isSetupRun(item, tid, chat);
}

// The run whose chat question your message answers by name, from its options.
function runAnswered(m: ChatLine, chat: ChatLike): string | null {
  const ids = Object.keys(m.answers ?? {});
  return (chat?.messages ?? []).find((q) => ids.includes(q.id) && typeof q.run === 'string')?.run ?? null;
}

function isSetupRun(item: RunItem, tid: string, chat: ChatLike | null | undefined): boolean {
  return (chat?.messages ?? []).some((m) => m.kind === 'msg' && m.from === YOU && m.setup && (m.to ?? []).includes(tid) && runIdFor(`${m.id}>${tid}`) === item.id);
}

// A duty stops waking once this many of its results in a row reached you and
// sat a day unanswered; your answer or close on any of them starts it again.
export const UNREAD_HOLD = 3;

export function dutyUnread(teammateId: string, dutyId: string, items: readonly RunItem[], now = Date.now()): boolean {
  const reached = runsOf(teammateId, items)
    .filter((i) => dutyOf(i) === dutyId && i.wrote?.result?.source === 'agent' && !(i.labels ?? []).includes('clean'))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  let unread = 0;
  for (const i of reached) {
    const sentAt = i.wrote?.result?.ts ?? 0;
    const answered = i.wrote?.answer?.source === 'founder' && (i.wrote.answer.ts ?? 0) >= sentAt;
    const closed = i.status === 'done' && i.wrote?.status?.source === 'founder';
    if (answered || closed || now - sentAt < 24 * 60 * 60 * 1000) return false;
    unread += 1;
    if (unread >= UNREAD_HOLD) return true;
  }
  return false;
}

export function isQueued(item: { status?: string; start?: string } | null | undefined): boolean {
  return item?.status === 'open' && item?.start === 'later';
}

// Running or about to: one at a time per teammate, so this is what the queue
// waits behind.
export function isActiveRun(item: RunItem | null | undefined): boolean {
  if (!item || item.status === 'done') return false;
  if (isQueued(item)) return false;
  return !waitingOnYou(item);
}

export function activeRunOf(teammateId: string, items: readonly RunItem[] | null | undefined): RunItem | null {
  return runsOf(teammateId, items).find(isActiveRun) ?? null;
}

export function runsThisWeek(teammateId: string, items: readonly RunItem[] | null | undefined, now = Date.now()): number {
  return runsOf(teammateId, items).filter((i) => (i.createdAt ?? 0) > now - WEEK_MS).length;
}

// ------------------------------------------------------------ looking back
// A run that rereads the threads you replied on and tightens the method. It
// spends the person's plan on no work they asked for, so each rule below is
// there to keep it rare and cheap.
export const LOOK_BACK_LABEL = 'look-back';
export const LOOK_BACK_AFTER = 3;
const LOOK_BACK_EVERY_MS = 24 * 60 * 60 * 1000;
const LOOK_BACK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const LOOK_BACK_LEAVES = 3;
const LOOK_BACK_THREADS = 6;
const USAGE_FRESH_MS = 6 * 60 * 60 * 1000;
const ROOM_SESSION = 50;
const ROOM_WEEK = 60;

export const isLookBack = (item: { labels?: readonly string[] } | null | undefined): boolean => (item?.labels ?? []).includes(LOOK_BACK_LABEL);

function yourLastWordAt(item: RunItem): number {
  const w = item?.wrote ?? {};
  const answered = w.answer?.source === 'founder' ? w.answer.ts ?? 0 : 0;
  const closed = item?.status === 'done' && w.status?.source === 'founder' ? w.status.ts ?? 0 : 0;
  return Math.max(answered, closed);
}

/** When the teammate last looked back, before `before`; 0 if it never has. */
export function lookBackSince(teammateId: string, items: readonly RunItem[] | null | undefined, before = Infinity): number {
  let at = 0;
  for (const i of runsOf(teammateId, items)) {
    const c = i.createdAt ?? 0;
    if (isLookBack(i) && c < before && c > at) at = c;
  }
  return at;
}

/** Its runs you replied on or closed since `since`, in the last two weeks, oldest first. */
export function taughtRuns(teammateId: string, items: readonly RunItem[] | null | undefined, since: number, now = Date.now()): RunItem[] {
  return runsOf(teammateId, items)
    .filter((i) => !isLookBack(i) && (i.createdAt ?? 0) >= now - LOOK_BACK_WINDOW_MS && yourLastWordAt(i) > since)
    .sort((a, b) => yourLastWordAt(a) - yourLastWordAt(b));
}

/** The threads a look-back rereads: the newest few you replied on since the last one. */
export function lookBackThreads(teammateId: string, items: readonly RunItem[] | null | undefined, item: { createdAt?: number } | null | undefined, now = Date.now()): RunItem[] {
  const since = lookBackSince(teammateId, items, item?.createdAt ?? now);
  return taughtRuns(teammateId, items, since, item?.createdAt ?? now).slice(-LOOK_BACK_THREADS);
}

/**
 * Whether a plan's usage reading leaves room for a look-back: known, read in
 * the last six hours, and every limit well under its line. Unknown is no.
 */
export function roomToLookBack(reading: { at?: number; limits?: readonly { span?: string; percent?: number | null }[] | null } | null | undefined, now = Date.now()): boolean {
  const limits = reading?.limits ?? [];
  if (!limits.length || !(now - (reading?.at ?? 0) < USAGE_FRESH_MS)) return false;
  return limits.every((l) => {
    const p = Number(l?.percent);
    if (!Number.isFinite(p)) return false;
    return p < (l.span === 'session' ? ROOM_SESSION : ROOM_WEEK);
  });
}

export const lookBackEffort = (effort: string | null | undefined): 'low' | 'medium' => (effort === 'low' ? 'low' : 'medium');

// Deterministic, so a tick that dies after creating the run and before marking
// the message seen finds the same row next time rather than making a second.
export function runIdFor(seed: unknown): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `w-${h1.toString(16).padStart(8, '0')}${(h2 >>> 16).toString(16).padStart(4, '0')}`;
}

// Which runs have handed each other work, newest first: two runs are talking
// once a message from one was taken into the other.
function talkingRuns(chat: ChatLike | null | undefined): Map<string, Map<string, number>> {
  const byId = new Map((chat?.messages ?? []).map((m) => [m.id, m]));
  const links = new Map<string, Map<string, number>>();
  const link = (a: string, b: string, ts: number) => {
    if (!links.has(a)) links.set(a, new Map());
    if ((links.get(a)!.get(b) ?? -1) < ts) links.get(a)!.set(b, ts);
  };
  for (const [run, taken] of chat?.into ?? []) {
    for (const s of taken) {
      const sender = byId.get(s.ref)?.run;
      if (typeof sender === 'string' && sender !== run) { link(sender, run, s.ts); link(run, sender, s.ts); }
    }
  }
  return links;
}

// The words a hand-off puts on the thread it goes to.
export function handOffText(m: { title?: string; details?: string }): string {
  return [m.title ? `**${m.title}**` : null, String(m.details ?? '').trim() || null].filter(Boolean).join('\n\n') || 'Work passed on';
}

function clip(text: unknown, max: number): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Named, because the Team view and Today list runs with no teammate beside them.
export function setupTitle(name: string | null | undefined): string {
  const n = String(name ?? '').trim();
  return !n || n === 'New teammate' ? 'Set up a new teammate' : `Set up ${n}`;
}

export const isSetupTitle = (title: string | null | undefined): boolean => title === 'Set up its job' || /^Set up /.test(String(title ?? ''));

export function runTitle(trigger: WakeTrigger, teammate: { name?: string }): string {
  if (trigger.kind === 'schedule') return trigger.label === 'week' ? "This week's round" : "Today's round";
  if (trigger.kind === 'duty') return clip(trigger.what, 120);
  if (trigger.kind === 'look-back') return 'Learn from your recent replies';
  if (trigger.kind === 'pass') return clip(trigger.title || 'Work passed on', 120);
  if (trigger.kind === 'first') return 'Start on its first job';
  if (trigger.opening === 'setup') return setupTitle(teammate?.name);
  if (trigger.opening === 'start') return 'Introduce itself and begin';
  const said = partFor(trigger.text, teammate.name) || firstLine(trigger.text) || 'A message';
  return clip(trigger.fromName ? `From ${trigger.fromName}: ${said}` : said, 120);
}

const firstLine = (text: unknown): string => String(text ?? '').trim().split('\n')[0].trim();

// What a message says to one teammate it names: from its @Name to the end of
// that sentence, when there is anything there.
function partFor(text: unknown, name: string | undefined): string | null {
  const words = String(text ?? '');
  const at = name ? words.search(new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i')) : -1;
  if (at < 0) return null;
  const rest = words.slice(at + name!.length + 1).replace(/^[\s,:;–—-]+/, '');
  const part = rest.split(/\n|\s@\w/)[0].replace(/[\s.,;:]+$/, '').trim();
  return part ? part[0].toUpperCase() + part.slice(1) : null;
}

/** The team chat as the waking rules read it. */
export interface ChatLike {
  messages?: readonly ChatLine[];
  seen: ReadonlySet<string>;
  into?: ReadonlyMap<string, readonly SeenInto[]>;
}

interface TriggerBase {
  from?: string;
  msg?: string;
  hop?: number;
  product?: string;
  via?: string;
  viaProduct?: string | null;
  work?: string;
  hold?: boolean;
  key?: string;
}

/** What woke a teammate's run. */
export type WakeTrigger =
  | (TriggerBase & { kind: 'schedule'; key: string; label: string })
  | (TriggerBase & { kind: 'duty'; duty: string; what: string; tell?: string; key: string })
  | (TriggerBase & { kind: 'pass'; fromName?: string; title?: string; details?: string })
  | (TriggerBase & { kind: 'message'; text?: string; fromName?: string; opening?: 'start' | 'setup'; priority?: number })
  | (TriggerBase & { kind: 'first'; key: string })
  | (TriggerBase & { kind: 'look-back'; since: number });

interface ActionBase { teammate: string; msg?: string; trigger?: WakeTrigger }

/** One thing the tick should do. */
export type WakeAction =
  | (ActionBase & { type: 'run'; id: string; trigger: WakeTrigger; title: string; start: 'now' | 'later' })
  | (ActionBase & { type: 'seen'; msg: string; run?: string })
  | (ActionBase & { type: 'served'; key: string })
  | (ActionBase & { type: 'dutyServed'; duty: string; key: string })
  | (ActionBase & { type: 'answer'; item: string; product: string; text: string | undefined; msg: string; priority?: number })
  | (ActionBase & { type: 'tell'; item: string; product: string | null; text: string; from: { teammate: string; name: string }; hop: number; hold: boolean; msg: string })
  | (ActionBase & { type: 'release'; item: string; product: string })
  | (ActionBase & { type: 'limit' })
  | (ActionBase & { type: 'unread'; duty: string; what: string })
  | (ActionBase & { type: 'hops'; msg: string; from: string })
  | (ActionBase & { type: 'replied'; item: string; product: string; labels: readonly string[]; text: string; say: boolean })
  | (ActionBase & { type: 'say'; item: string; text: string })
  | (ActionBase & { type: 'firstServed' })
  | (ActionBase & { type: 'reopen'; item: string; product: string; labels: readonly string[] });

/** A run made earlier in the same tick, before any row for it exists. */
type MadeRun = Omit<RunItem, 'product'> & { teammate: string; product: string | null };

// What the tick should do now, decided without touching anything, so it can be
// tested on plain data and the main process only carries it out.
//
// - Your message or pass wakes the teammate it names. Your words go into the
//   run already waiting on you or already running, since they are most likely
//   the answer; anything else becomes a run of its own.
// - A teammate naming another in the chat wakes nobody: it is read on that
//   teammate's next turn. Only a hand-off (a pass) makes a teammate act.
// - A teammate's hand-off goes to the thread the receiver already has talking
//   with the sender, else its thread on the same work of yours in the same
//   project, as a reply from the sender (`tell`). A thread its agent finished
//   opens again; one you closed is not touched, and the hand-off starts a new
//   thread. It is held for your reply unless the receiver saved
//   `handoffsNeedYes: false`.
// - A schedule that is owed becomes a run.
// - One run at a time: a new run behind an active one is made queued, and a
//   teammate with nothing active gets its oldest queued run released.
// - A teammate past its weekly runs takes nothing new except your own words.
export function planWakes({ teammates = [], chat = { messages: [], seen: new Set() }, items = [], now = Date.now(), shipped = {}, lookBack = null }: {
  teammates?: readonly TeammateLike[];
  chat?: ChatLike;
  items?: readonly RunItem[];
  now?: number;
  /** When each project last shipped. */
  shipped?: Readonly<Record<string, number>>;
  /** Whether a teammate may look back now (it has a method, and its plan has room). */
  lookBack?: { ok: (t: TeammateLike) => boolean } | null;
} = {}): WakeAction[] {
  const actions: WakeAction[] = [];
  const live = teammates.filter((t) => !t.endedAt);
  const byId = new Map(live.map((t) => [t.id, t]));
  const pendingNew = new Map<string, number>();
  const startsNow = new Map<string, boolean>();
  const limited = new Set<string>();

  const talking = talkingRuns(chat);
  // Runs made this tick, so a second hand-off in the same tick finds the first.
  const made: MadeRun[] = [];
  const homeOf = (t: TeammateLike, m: ChatLine): RunItem | MadeRun | null => {
    const runs = [...runsOf(t.id, items), ...made.filter((r) => r.teammate === t.id)];
    const partners = talking.get(m.run as string);
    const partner = partners && runs.filter((r) => partners.has(r.id)).sort((a, b) => partners.get(b.id)! - partners.get(a.id)!)[0];
    if (partner) return partner;
    const where = m.product ?? t.product ?? null;
    return runs.filter((r) => m.work && workOf(r) === m.work && (!where || !r.product || r.product === where))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? null;
  };
  const closedByYou = (r: RunItem | MadeRun): boolean => r.status === 'done' && r.wrote?.status?.source === 'founder';

  const active = (t: TeammateLike) => !!activeRunOf(t.id, items) || startsNow.get(t.id);
  const overLimit = (t: TeammateLike) => runsThisWeek(t.id, items, now) + (pendingNew.get(t.id) ?? 0) >= (t.limit ?? DEFAULT_LIMIT);

  // A held run waits for your reply, not for its turn, so it neither queues
  // nor holds up the teammate's next run.
  const newRun = (t: TeammateLike, trigger: WakeTrigger, seed: string, { fromYou = false, hold = false }: { fromYou?: boolean; hold?: boolean } = {}): string | null => {
    if (!fromYou && overLimit(t)) {
      limited.add(t.id);
      return null;
    }
    const later = !hold && active(t);
    const id = runIdFor(seed);
    actions.push({ type: 'run', teammate: t.id, id, trigger, title: runTitle(trigger, t), start: later ? 'later' : 'now' });
    pendingNew.set(t.id, (pendingNew.get(t.id) ?? 0) + 1);
    if (!later && !hold) startsNow.set(t.id, true);
    return id;
  };

  for (const m of chat.messages ?? []) {
    if (m.kind !== 'msg' && m.kind !== 'pass') continue;
    const targets = m.kind === 'pass' ? [m.to as string] : (Array.isArray(m.to) ? m.to : []);
    for (const tid of targets) {
      const t = byId.get(tid);
      if (!t || chat.seen.has(seenKey(m.id, tid))) continue;
      // Its own pass to another project is the one word of its own that wakes it.
      const selfPass = m.kind === 'pass' && !!m.product;
      if (m.from === tid && !selfPass) { actions.push({ type: 'seen', msg: m.id, teammate: tid }); continue; }
      if (t.paused && m.from !== YOU) continue;
      const fromYou = m.from === YOU;
      if (!fromYou && m.kind === 'msg') { actions.push({ type: 'seen', msg: m.id, teammate: tid }); continue; }
      const hop = fromYou ? 0 : (Number.isInteger(m.hop) ? m.hop as number : 0) + 1;
      if (hop > MAX_HOPS) {
        actions.push({ type: 'seen', msg: m.id, teammate: tid });
        actions.push({ type: 'hops', teammate: tid, msg: m.id, from: m.from });
        continue;
      }
      // A new thread to a teammate is new work, never an answer to its last question.
      if (fromYou && m.kind === 'msg' && !m.fresh) {
        const runs = runsOf(tid, items);
        const named = runAnswered(m, chat);
        const waiting = runs.find((i) => i.id === named && waitingOnYou(i))
          ?? runs.filter((i) => waitingOnYou(i) && asksYouStill(i, tid, chat, m.id) && talksInChat(i, tid, chat, m.id)).sort((a, b) => (b.wrote?.result?.ts ?? 0) - (a.wrote?.result?.ts ?? 0))[0];
        // A running run hears your words only if your words started it;
        // anything else is new work, queued behind it.
        const yours = new Set((chat.messages ?? []).filter((x) => x.kind === 'msg' && x.from === YOU && x.id !== m.id).map((x) => runIdFor(`${x.id}>${tid}`)));
        const running = runs.find((i) => isActiveRun(i) && i.status === 'claimed' && yours.has(i.id));
        const into = waiting ?? running;
        if (into) {
          actions.push({ type: 'answer', teammate: tid, item: into.id, product: into.product, text: m.text, msg: m.id, ...(m.priority ? { priority: m.priority } : {}) });
          actions.push({ type: 'seen', msg: m.id, teammate: tid, run: into.id });
          continue;
        }
      }
      // `yours`: the primary passing on what your own words asked of it.
      const hold = !fromYou && !m.yours && (selfPass || t.handoffsNeedYes !== false);
      const home = fromYou ? null : homeOf(t, m);
      if (home && !closedByYou(home)) {
        const from = { teammate: m.from, name: byId.get(m.from)?.name ?? 'A teammate' };
        actions.push({ type: 'tell', teammate: tid, item: home.id, product: home.product ?? null, text: handOffText(m), from, hop, hold, msg: m.id });
        actions.push({ type: 'seen', msg: m.id, teammate: tid, run: home.id });
        continue;
      }
      // Where it came from travels with it: the project it was passed from, and
      // the thread that spoke for you, when one did.
      const origin = { ...(m.product ? { product: m.product } : {}), ...(m.via ? { via: m.via, viaProduct: m.viaProduct ?? null } : {}) };
      const work = fromYou ? m.via ?? null : m.work ?? null;
      const trigger: WakeTrigger = m.kind === 'pass'
        ? { kind: 'pass', from: m.from, ...(m.fromName ? { fromName: m.fromName } : {}), title: m.title, details: m.details, msg: m.id, hop, ...origin, ...(work ? { work } : {}), ...(hold ? { hold } : {}) }
        : { kind: 'message', from: m.from, text: m.text, msg: m.id, hop, ...origin, ...(work ? { work } : {}), ...(fromYou && m.priority ? { priority: m.priority } : {}), ...(fromYou && m.start ? { opening: 'start' } : fromYou && m.setup ? { opening: 'setup' } : {}) };
      const id = newRun(t, trigger, `${m.id}>${tid}`, { fromYou, hold });
      if (id) {
        actions.push({ type: 'seen', msg: m.id, teammate: tid, run: id });
        made.push({ id, teammate: tid, product: m.product ?? t.product ?? null, status: 'open', labels: [`${WORK_LABEL_PREFIX}${work ?? id}`] });
        if (typeof m.run === 'string') {
          if (!talking.has(m.run)) talking.set(m.run, new Map());
          talking.get(m.run)!.set(id, now);
        }
      }
    }
  }

  // A run your chat words started that answered without asking anything: its
  // answer is said in the chat, and the run closes quietly rather than sitting
  // in Needs you. A run still being set up asks through its setup instead.
  for (const t of live) {
    if (t.status !== 'active') continue;
    for (const i of runsOf(t.id, items)) {
      if (!(i.labels ?? []).includes(CHAT_LABEL) || !waitingOnYou(i) || asksYouStill(i, t.id, chat)) continue;
      const text = String(i.result ?? '').trim();
      const since = i.wrote?.answer?.ts ?? 0;
      const posted = (chat.messages ?? []).some((x) => x.kind === 'msg' && x.from === t.id && x.run === i.id && !x.options?.length && x.ts > since && toNames(x.to).every((y) => y === YOU));
      const said = (chat.messages ?? []).some((x) => x.id === replyMessageId(i.id));
      actions.push({ type: 'replied', teammate: t.id, item: i.id, product: i.product, labels: i.labels ?? [], text, say: !!text && !posted && !said });
    }
  }

  // A finished look-back asks nothing of you, whatever its answer says; it
  // posts its own line when the method changed. A blocked one stays to be seen.
  for (const t of live) {
    for (const i of runsOf(t.id, items)) {
      if (!isLookBack(i) || i.status === 'blocked' || !waitingOnYou(i)) continue;
      actions.push({ type: 'replied', teammate: t.id, item: i.id, product: i.product, labels: i.labels ?? [], text: '', say: false });
    }
  }

  // A run that closed itself on a question is in nobody's Needs you, so the
  // question is said in the chat. Only a recent close, so an update does not
  // bring back every old question at once. A setup that closed leaving
  // anything open goes back to Needs you instead, which is where its owner looks.
  for (const t of live) {
    for (const i of runsOf(t.id, items)) {
      const closedAt = i.wrote?.status?.ts ?? 0;
      if (i.status !== 'done' || i.wrote?.status?.source !== 'agent' || now - closedAt > SAY_CLOSED_MS) continue;
      const text = String(i.result ?? '').trim();
      const since = i.wrote?.answer?.ts ?? 0;
      if ((i.wrote?.result?.ts ?? 0) <= since) continue;
      if (isSetupRun(i, t.id, chat)) {
        if (leavesSomethingOpen(text)) actions.push({ type: 'reopen', teammate: t.id, item: i.id, product: i.product, labels: (i.labels ?? []).filter((l) => l !== 'clean') });
        continue;
      }
      if (!asksSomething(text)) continue;
      const fromRun = (chat.messages ?? []).filter((x) => x.kind === 'msg' && x.from === t.id && x.run === i.id && x.ts > since);
      if ((chat.messages ?? []).some((x) => x.id === replyMessageId(i.id))) continue;
      const questions = questionsIn(text);
      const asked = questions.length
        ? questions.every((q) => fromRun.some((x) => String(x.text ?? '').includes(q)))
        : fromRun.some((x) => x.options?.length);
      if (!asked) actions.push({ type: 'say', teammate: t.id, item: i.id, text });
    }
  }

  for (const t of live) {
    if (t.paused || t.status !== 'active' || !isWorks(t.works) || pausedNow(t, now)) continue;
    const key = periodKey(t.works, now);
    if (!key || key <= servedOf(t)) continue;
    const id = newRun(t, { kind: 'schedule', key, label: t.works.every === 'week' ? 'week' : 'round' }, `${t.id}@${key}`);
    if (id) actions.push({ type: 'served', teammate: t.id, key });
  }

  for (const t of live) {
    if (t.paused || t.status !== 'active' || pausedNow(t, now)) continue;
    for (const d of t.duties ?? []) {
      if (dutyUnread(t.id, d.id, items, now)) {
        actions.push({ type: 'unread', teammate: t.id, duty: d.id, what: d.what });
        continue;
      }
      const served = t.dutyServed?.[d.id] ?? '';
      let key: string | null = null;
      if (d.after === 'ship') {
        const at = shipped?.[t.product as string];
        const seenAt = Number(String(served).replace(/^ship@/, '')) || 0;
        if (!Number.isFinite(at) || at <= seenAt) continue;
        const week = runsOf(t.id, items).filter((i) => dutyOf(i) === d.id && now - (i.createdAt ?? 0) < WEEK_MS).length;
        if (d.most && week >= d.most) continue;
        key = `ship@${at}`;
      } else {
        const slot = dutySlot(d, now);
        if (!slot || slot <= served) continue;
        key = slot;
      }
      const id = newRun(t, { kind: 'duty', duty: d.id, what: d.what, ...(d.tell ? { tell: d.tell } : {}), key }, `${t.id}#${d.id}@${key}`);
      if (id) actions.push({ type: 'dutyServed', teammate: t.id, duty: d.id, key });
    }
  }

  // Set up just now: its first job starts at once, not at its first duty's time.
  for (const t of live) {
    if (t.firstRun !== 'owed' || t.paused || t.status !== 'active' || pausedNow(t, now)) continue;
    const id = newRun(t, { kind: 'first', key: 'first' }, `${t.id}#first`);
    if (id) actions.push({ type: 'firstServed', teammate: t.id });
  }

  // Last, so it never takes a place real work wanted this tick.
  for (const t of live) {
    if (!lookBack?.ok?.(t) || t.paused || t.status !== 'active' || pausedNow(t, now)) continue;
    if (active(t) || runsOf(t.id, items).some(isQueued) || pendingNew.get(t.id)) continue;
    if (runsThisWeek(t.id, items, now) >= (t.limit ?? DEFAULT_LIMIT) - LOOK_BACK_LEAVES) continue;
    const since = lookBackSince(t.id, items);
    if (since && now - since < LOOK_BACK_EVERY_MS) continue;
    if (taughtRuns(t.id, items, since, now).length < LOOK_BACK_AFTER) continue;
    const trigger: WakeTrigger = { kind: 'look-back', since };
    actions.push({ type: 'run', teammate: t.id, id: runIdFor(`${t.id}~look-back~${since}`), trigger, title: runTitle(trigger, t), start: 'now' });
    pendingNew.set(t.id, 1);
    startsNow.set(t.id, true);
  }

  for (const t of live) {
    if (t.paused || active(t)) continue;
    const next = runsOf(t.id, items).filter(isQueued).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0];
    if (next) actions.push({ type: 'release', teammate: t.id, item: next.id, product: next.product });
  }

  for (const tid of limited) actions.push({ type: 'limit', teammate: tid });
  return actions;
}

// ---------------------------------------------------------------- what you see

type Named = { id: string; name?: string };

/** One line a run leaves in the team chat. */
export interface RunLine {
  teammate: string;
  item: string;
  product: string;
  title?: string;
  id: string;
  kind: 'run';
  verb: 'queued' | 'passed' | 'picked' | 'answered' | 'sent' | 'stopped' | 'finished';
  ts: number;
  by?: string;
  byName?: string;
  text?: string;
  said?: string;
  waiting?: boolean;
  answered?: boolean;
}

function verbFor(item: RunItem, teammates: readonly Named[]): { verb: 'passed' | 'picked'; by?: string; byName?: string } {
  const from = passedFromOf(item);
  if (from) {
    const who = teammates.find((t) => t.id === from);
    return { verb: 'passed', by: from, byName: who?.name ?? 'A teammate' };
  }
  return { verb: 'picked' };
}

// The note is written at the moment of the close, so a run reopened and
// finished later reads as finished again.
export const STOPPED_NOTE = 'Stopped by you.';
export function stoppedByYou(item: RunItem | null | undefined): boolean {
  return item?.status === 'done' && item.note === STOPPED_NOTE && item.wrote?.note?.ts === item.wrote?.status?.ts;
}

// The lines a run leaves in the chat, read straight off the ledger so they can
// never disagree with it: picked up (or passed on), sent you, finished.
export function runLines(items: readonly RunItem[] | null | undefined, teammates: readonly Named[] = []): RunLine[] {
  const out: RunLine[] = [];
  for (const item of items ?? []) {
    const tid = teammateIdOf(item);
    if (!tid) continue;
    const base = { teammate: tid, item: item.id, product: item.product, title: item.label || item.title };
    if (isQueued(item)) {
      out.push({ ...base, id: `${item.id}:queued`, kind: 'run', verb: 'queued', ts: item.createdAt ?? 0 });
      continue;
    }
    const v = verbFor(item, teammates);
    out.push({ ...base, id: `${item.id}:start`, kind: 'run', verb: v.verb, by: v.by, byName: v.byName, ts: item.wrote?.start?.ts ?? item.createdAt ?? 0 });
    const a = item.wrote?.answer;
    const said = typeof item.answer === 'string' ? item.answer.trim() : '';
    if (a && a.source === 'founder' && said && said !== '(withdrawn)') {
      out.push({ ...base, id: `${item.id}:answered`, kind: 'run', verb: 'answered', text: clip(said, 400), ts: a.ts });
    }
    const r = item.wrote?.result;
    if (r && r.source === 'agent' && !(item.labels ?? []).includes('clean')) {
      const answered = (item.wrote?.answer?.ts ?? 0) > r.ts;
      const said = String(item.result ?? '').split('\n').map((l) => l.replace(/\*\*|__|`|^#+\s*/g, '').trim()).find(Boolean) ?? '';
      out.push({ ...base, id: `${item.id}:sent`, kind: 'run', verb: 'sent', said: clip(said, 200), waiting: waitingOnYou(item), answered, ts: r.ts });
    }
    if (item.status === 'done') {
      out.push({ ...base, id: `${item.id}:done`, kind: 'run', verb: stoppedByYou(item) ? 'stopped' : 'finished', ts: item.wrote?.status?.ts ?? item.updatedAt ?? 0 });
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

function startOfDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** A run, by where it lives and what it is called. */
export interface ItemRef { id: string; product: string; title?: string }

/** What a teammate is on, what waits on you, and what it finished today. */
export interface TeammateStatus {
  waiting: ItemRef[];
  /** In words: its run's name, "Waiting on you" or "Paused". */
  now: string | null | undefined;
  running: { id: string; product: string } | null;
  queued: number;
  next: ItemRef[];
  done: ItemRef[];
  runsThisWeek: number;
}

// The panel beside a teammate: what is waiting on you, what it is on now, and
// what it finished today.
export function statusOf(teammate: { id: string; paused?: boolean }, items: readonly RunItem[] | null | undefined, now = Date.now()): TeammateStatus {
  const runs = runsOf(teammate.id, items);
  const waiting = runs.filter(waitingOnYou).map((i) => ({ id: i.id, product: i.product, title: i.label || i.title }));
  const running = runs.find((i) => isActiveRun(i));
  const next = runs.filter(isQueued).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)).map((i) => ({ id: i.id, product: i.product, title: i.label || i.title }));
  const queued = next.length;
  const today = startOfDay(now);
  const done = runs
    .filter((i) => i.status === 'done' && (i.wrote?.status?.ts ?? i.updatedAt ?? 0) >= today)
    .map((i) => ({ id: i.id, product: i.product, title: i.label || i.title }));
  let now_: string | null | undefined = null;
  if (running) now_ = running.label || running.title;
  else if (waiting.length) now_ = 'Waiting on you';
  else if (teammate.paused) now_ = 'Paused';
  return { waiting, now: now_, running: running ? { id: running.id, product: running.product } : null, queued, next, done, runsThisWeek: runsThisWeek(teammate.id, items, now) };
}

// ---------------------------------------------------------------- starters

// The six a new person can start from. Copy is plain and specific about what
// each one brings you, because that is what has to jump out.
/** What a new teammate says first, with the starters as answers to tap. */
export const GREETING = 'Hi. What should I take off your plate? Pick one, or tell me in your own words.';

/** The starters a new teammate offers: those whose job or name nobody on the team has yet. */
export function starterAsks(team: readonly { starter?: string | null; name?: string }[] = []): { starter: string; ask: string; name: string; role: string }[] {
  return STARTERS.filter((s) => !team.some((t) => t.starter === s.starter || t.name === s.name))
    .map((s) => ({ starter: s.starter, ask: s.ask, name: s.name, role: s.role }));
}

// Above the app's default, Medium: a teammate works with nobody watching.
export const TEAMMATE_EFFORT = 'high';

/** A teammate a new person can start from, and what it brings them. */
export interface Starter {
  starter: string;
  name: string;
  role: string;
  primary?: boolean;
  voice: string;
  ask: string;
  outcome: string;
  sends: string;
  job: string;
  goal: string;
  counted: string;
  asksFirst: string;
  works: RepeatShape | null;
}

export const STARTERS: Starter[] = [
  {
    starter: 'chief', name: 'Chief of staff', role: 'Chief of staff', primary: true, voice: 'careful',
    ask: 'Be the one I talk to',
    outcome: 'Takes anything you send, gets it to the right teammate, and checks in with only what needs you',
    sends: 'One check-in a weekday with what needs you',
    job: 'Be the person\'s main point of contact. Take whatever they send you: hand it to the teammate whose job it is, do it yourself when it is small or nobody\'s, and offer a new teammate when a kind of work keeps coming and nobody owns it. Every weekday morning check in once with what is waiting on them, most urgent first, what finished and what is stuck. When they give a rule for one project, such as when its work ships or what needs their yes, ask whether to keep it for that project, and once they agree add it with add_project_rule so every agent there follows it. Stay quiet when nothing needs them.',
    goal: 'You never have to chase a teammate',
    counted: 'Things you had to chase yourself',
    asksFirst: 'Before making a new teammate, or handing on work you did not ask for',
    works: { every: 'weekday', at: '09:00' },
  },
  {
    starter: 'quality', name: 'Quality lead', role: 'Quality lead', voice: 'blunt',
    ask: 'Find bugs before your users do',
    outcome: 'Finds bugs before your users do',
    sends: 'A bug, with the steps to make it happen',
    job: 'Find bugs before your users do. Every weekday morning look at what changed, run the project\'s own tests, and use the main flows the way a user would, on a phone-sized window and a slow connection too. File anything broken with the exact steps to make it happen, and pass fixable bugs to whoever fixes things on the team.',
    goal: 'Nothing broken reaches a user',
    counted: 'Bugs users report that you did not find first',
    asksFirst: 'Before paying with a real card or signing in as a real person',
    works: { every: 'weekday', at: '09:00' },
  },
  {
    starter: 'maintainer', name: 'Maintainer', role: 'Maintainer', voice: 'dry',
    ask: 'Fix what gets filed',
    outcome: 'Fixes what gets filed, and asks you before shipping',
    sends: 'A fix that is ready to ship',
    job: 'Fix the bugs your teammates pass you and keep the project healthy: one branch per fix, with a test that fails before the fix and passes after. Never ship or merge without asking the person first.',
    goal: 'Every bug fixed within two days',
    counted: 'Days from a bug being filed to its fix being ready',
    asksFirst: 'Before shipping, merging, or deleting anything',
    works: null,
  },
  {
    starter: 'marketing', name: 'Marketing lead', role: 'Marketing lead', voice: 'curious',
    ask: 'Post about what we build',
    outcome: 'Brings you posts and clips about what you build, then makes the ones you pick',
    sends: 'Posts and clips ready for your yes',
    job: 'Keep people hearing about the project without the person having to think about it. When something ships, decide whether it is worth a post. Bring whole posts, each with a short clip, written the way the person writes. Nothing is posted without their yes.',
    goal: 'Something worth sharing goes out every week',
    counted: 'Posts the person approved each week',
    asksFirst: 'Before anything is posted or sent in their name',
    works: { every: 'week', on: 1, at: '09:00' },
  },
  {
    starter: 'support', name: 'Support lead', role: 'Support lead', voice: 'warm',
    ask: 'Answer user emails',
    outcome: 'Answers user emails, and asks you before any refund',
    sends: 'A refund or a tricky reply to approve',
    job: 'Read what users ask, draft clear answers, and keep a short list of what people get stuck on. Ask the person before any refund, promise or reply that commits them to something.',
    goal: 'Every user question answered the same day',
    counted: 'Questions still unanswered at the end of the day',
    asksFirst: 'Before any refund, promise, or reply that commits you',
    works: { every: 'weekday', at: '10:00' },
  },
  {
    starter: 'growth', name: 'Growth lead', role: 'Growth lead', voice: 'dry',
    ask: 'Tell me what moved signups',
    outcome: 'Tells you what moved signups, and what to try next',
    sends: 'What moved signups this week',
    job: 'Every Friday, look at what changed in signups and usage this week, explain what moved it in plain words, and suggest one thing to try next week.',
    goal: 'One clear next step for growth every week',
    counted: 'Experiments tried each month',
    asksFirst: 'Before changing anything users can see',
    works: { every: 'week', on: 5, at: '15:00' },
  },
  {
    starter: 'fundraising', name: 'Fundraiser', role: 'Fundraiser', voice: 'warm',
    ask: 'Find investors who fit',
    outcome: 'Finds investors who fit, and drafts intros from you',
    sends: 'Intro emails ready for your yes',
    job: 'Build and keep a short list of investors who fit the project, with why each one fits. Draft intro emails for the person to send. Never send anything yourself.',
    goal: 'First meetings with investors who fit',
    counted: 'First meetings booked',
    asksFirst: 'Before anything is sent in their name',
    works: { every: 'week', on: 2, at: '09:00' },
  },
];

// ---------------------------------------------------------------- the offer
// Offer rows from before Auto offered a teammate on the thread itself: one
// inbox row, which no agent ever runs, answered by a tap.
export const OFFER_LABEL = 'teammate-offer';
export const OFFER_MAKE = 'Make a teammate for it';
export const OFFER_NOT_NOW = 'Not now';

// ---------------------------------------------------------------- the method
// A teammate's method is one file it keeps and reads whole every run: what
// the job is, how it is done, what the person approved and turned down in
// their words, and what needs their yes. Past this it is cut with a mark.
export const METHOD_CAP = 16_000;

const KEYS = /\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,})\b/g;
const redact = (text: unknown): string => String(text ?? '').replace(KEYS, '[key removed]');
const cutText = (text: string, most: number): string => (text.length > most ? `${text.slice(0, most).trimEnd()}… (cut, ${text.length - most} more characters)` : text);

/**
 * One thread written out for a teammate to learn from: every word the person
 * said and every answer the agent gave, in order. A thread too long for `cap`
 * loses the agent's words first; the person's are kept whole.
 */
export function sourceText(thread: { title?: string; product?: string; id: string }, turns: readonly Turn[] | null | undefined, { cap = 80_000 }: { cap?: number } = {}): string {
  const said = (turns ?? []).filter((x) => (x.source === 'founder' || x.source === 'agent') && String(x.text ?? '').trim());
  const render = (agentMost: number): string => [
    `# ${thread.title} (${thread.product}/${thread.id})`,
    ...said.map((x) => (x.source === 'founder'
      ? `## You\n\n${redact(x.text!.trim())}`
      : `## The agent\n\n${cutText(redact(x.text!.trim()), agentMost)}`)),
  ].join('\n\n');
  for (const most of [Infinity, 6000, 1500, 400]) {
    const text = render(most);
    if (text.length <= cap) return text;
  }
  return `${render(400).slice(0, cap - 90)}\n\n… (cut here: this thread is longer than ${cap} characters)`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECORD_DAYS = 21;

/** One turn of a thread: who said it, on which field, and the words. */
export interface Turn { source?: string; field?: string; text?: string }

const headline = (text: unknown): string => clip(String(text ?? '').split('\n').map((l) => l.replace(/\*\*|__|`|^#+\s*/g, '').trim()).find(Boolean) ?? '', 240);

/**
 * The record of a teammate's recent work, read off the ledger: each run of the
 * last three weeks, oldest first, with every word the person said on it and
 * the first line of its last answer. A quiet run the person never spoke on is
 * left out. Past `cap` the oldest runs go first. `read(product, id)` gives a
 * thread's turns.
 */
export function recordOf(
  runs: readonly RunItem[] | null | undefined,
  read: (product: string, id: string) => readonly Turn[] | null | undefined,
  { now = Date.now(), cap = 8000, days = RECORD_DAYS }: { now?: number; cap?: number; days?: number } = {},
): string {
  const since = now - days * DAY_MS;
  const entries: string[] = [];
  const ordered = [...(runs ?? [])].filter((r) => (r.createdAt ?? 0) >= since).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  for (const r of ordered) {
    let turns: readonly Turn[] = [];
    try { turns = read(r.product, r.id) ?? []; } catch { turns = []; }
    const yours = turns
      .filter((x) => x.source === 'founder' && (x.field === 'body' || x.field === 'answer'))
      .map((x) => String(x.text ?? '').trim())
      .filter((x) => x && x !== '(withdrawn)');
    if ((r.labels ?? []).includes('clean') && !yours.length) continue;
    const last = [...turns].reverse().find((x) => x.source === 'agent' && x.field === 'result');
    const state = waitingOnYou(r) ? 'waiting on you' : r.status === 'done' ? (stoppedByYou(r) ? 'stopped by you' : 'finished') : 'open';
    const date = new Date(r.createdAt ?? now).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    entries.push([
      `- ${date}, "${clip(r.label || r.title, 120)}" (${r.product}/${r.id}), ${state}:`,
      ...yours.map((y) => `  You: "${clip(y, 800)}"`),
      ...(last ? [`  It said: "${headline(last.text)}"`] : []),
    ].join('\n'));
  }
  let dropped = 0;
  while (entries.length && entries.join('\n').length > cap) {
    entries.shift();
    dropped += 1;
  }
  if (!entries.length) return '';
  return [...(dropped ? [`(${dropped} older runs left out)`] : []), ...entries].join('\n');
}

/** What a tap on the offer meant: 'make', 'dismiss', or your own words to make one from. */
export function offerAnswer(answer: unknown): { kind: 'make' | 'dismiss'; words?: string } | null {
  const said = String(answer ?? '').trim();
  if (!said || said === '(withdrawn)') return null;
  if (/not now|^no\b|^2\.?$/i.test(said)) return { kind: 'dismiss' };
  if (said.toLowerCase().includes(OFFER_MAKE.toLowerCase()) || /^1\.?$/.test(said) || /^(yes|yep|sure|ok|okay)\b/i.test(said)) return { kind: 'make' };
  return { kind: 'make', words: said };
}
