// Teammates: the pure rules, shared by the main process, the store tools and
// the renderer, the way shared/repeats.mjs is.
//
// A teammate is a standing job, not a thread. Each time it wakes it works on an
// ordinary work item labelled `teammate:<id>`, so every rule about runs (held
// starts, Needs you, deadlines, the clean marker) applies to it unchanged.
// What is new lives in two append-only files per account: the teammates
// themselves, and one team chat that you and every teammate write to.
import { periodKey, isRepeatRule, servedOf, dateKey, clockLabel, DAY_NAMES } from './repeats.mjs';

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
export function teammatesOn(config) {
  return config?.alphaTeammates === true;
}
export const HOP_LABEL_PREFIX = 'hop:';

export function hopOf(item) {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(HOP_LABEL_PREFIX));
  const n = found ? Number(found.slice(HOP_LABEL_PREFIX.length)) : 0;
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function teammateLabel(id) {
  return `${TEAMMATE_LABEL_PREFIX}${id}`;
}

export function teammateIdOf(item) {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(TEAMMATE_LABEL_PREFIX));
  return found ? found.slice(TEAMMATE_LABEL_PREFIX.length) : null;
}

export function passedFromOf(item) {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(FROM_LABEL_PREFIX));
  return found ? found.slice(FROM_LABEL_PREFIX.length) : null;
}

// WHICH OF YOUR WORK A RUN IS ON: the thread of yours it came from, carried on
// by every hand-off made from it. A run with no label is its own work.
export const WORK_LABEL_PREFIX = 'work:';
export function workOf(item) {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(WORK_LABEL_PREFIX));
  return found ? found.slice(WORK_LABEL_PREFIX.length) : item?.id ?? null;
}

const ID_RE = /^t-[0-9a-f]{6,}$/;
export function isTeammateId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

// ---------------------------------------------------------------- teammates

// A field written and missing from here is folded away at the next start, the
// way `on` once vanished from every weekly repeating task.
const FIELDS = [
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
];

export const STATUSES = ['draft', 'active'];

export const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00`));

/** The primary teammate, while it is set up and working, or null. */
export function primaryOf(team = []) {
  return (team ?? []).find((t) => t?.primary && !t.endedAt && !t.paused && (t.status ?? 'active') === 'active') ?? null;
}

export function pausedNow(t, now = Date.now()) {
  return isDate(t?.pausedUntil) && dateKey(now) < t.pausedUntil;
}

export function isWorks(works) {
  return isRepeatRule(works);
}

// ---------------------------------------------------------------- duties
// What a teammate does on its own, each with its own times or "after a ship"
// in its project. A teammate with only the older single `works` schedule has
// none, and its round runs as before.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EVERY_DUTY = ['day', 'weekday', 'week'];

export function cleanDuty(d) {
  if (!d || typeof d !== 'object') return null;
  const id = typeof d.id === 'string' && /^d-[\w-]{1,40}$/.test(d.id) ? d.id : null;
  const what = cleanText(d.what, 300);
  if (!id || !what) return null;
  const tell = cleanText(d.tell, 300);
  if (d.after === 'ship') {
    const most = Number.isInteger(d.most) && d.most >= 1 && d.most <= 14 ? d.most : null;
    return { id, what, after: 'ship', ...(most ? { most } : {}), ...(tell ? { tell } : {}) };
  }
  const at = (Array.isArray(d.at) ? d.at : [d.at]).filter((x) => typeof x === 'string' && TIME.test(x));
  if (!EVERY_DUTY.includes(d.every) || !at.length || at.length !== (Array.isArray(d.at) ? d.at : [d.at]).length) return null;
  if (d.every === 'week' && !(Number.isInteger(d.on) && d.on >= 0 && d.on <= 6)) return null;
  return { id, what, every: d.every, at: [...new Set(at)].sort().slice(0, 6), ...(d.every === 'week' ? { on: d.on } : {}), ...(tell ? { tell } : {}) };
}

const TIMES_WORD = ['', 'once', 'twice', 'three times', 'four times', 'five times'];

/** When a duty runs, in plain words: "Daily at 9:00am and 3:00pm", "After a ship, at most twice a week". */
export function dutyWhen(d) {
  if (d?.after === 'ship') return d.most ? `After a ship, at most ${TIMES_WORD[d.most] ?? `${d.most} times`} a week` : 'After a ship';
  const at = (Array.isArray(d?.at) ? d.at : []).map((x) => clockLabel(x));
  if (!at.length) return '';
  const times = at.length === 1 ? at[0] : `${at.slice(0, -1).join(', ')} and ${at.at(-1)}`;
  if (d.every === 'day') return `Daily at ${times}`;
  if (d.every === 'weekday') return `Weekdays at ${times}`;
  return `${DAY_NAMES[d.on]}s at ${times}`;
}

/** The latest time slot of a timed duty that has come, as "YYYY-MM-DDTHH:MM", or null before the first. */
export function dutySlot(d, now = Date.now()) {
  let best = null;
  for (const at of d.at ?? []) {
    const key = periodKey({ every: d.every, at, ...(d.every === 'week' ? { on: d.on } : {}) }, now);
    if (!key) continue;
    const slot = `${key}T${at}`;
    if (!best || slot > best) best = slot;
  }
  return best;
}

/** What a duty has seen so far when it is set, so a time or a ship already past fires nothing. */
export function dutyStart(d, now = Date.now()) {
  return d.after === 'ship' ? `ship@${now}` : dutySlot(d, now) ?? '';
}

export const DUTY_LABEL_PREFIX = 'duty:';

// What needs the person's yes first, as a rule. A question saved there is not
// one (setup refuses it now; older teammates may still carry one).
export function yesFirst(asksFirst) {
  const rule = String(asksFirst ?? '').trim();
  return rule && !rule.endsWith('?') ? rule : null;
}
// A run your own words in a teammate's chat woke. You are in that chat
// waiting for its answer, so it is next for a free agent.
export const CHAT_LABEL = 'from-chat';
export const dutyOf = (item) => (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(DUTY_LABEL_PREFIX))?.slice(DUTY_LABEL_PREFIX.length) ?? null;

function cleanText(v, max = 2000) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function coerce(field, value) {
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
    case 'limit': return Number.isInteger(value) && value >= 1 && value <= 500 ? value : undefined;
    case 'paused': case 'handoffsNeedYes': case 'primary': return !!value;
    case 'status': return STATUSES.includes(value) ? value : undefined;
    case 'endedAt': case 'createdAt': return Number.isFinite(value) ? value : value === null ? null : undefined;
    case 'served': return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
    case 'pausedUntil': return value === null ? null : isDate(value) ? value : undefined;
    case 'duties': return Array.isArray(value) ? value.map(cleanDuty).filter(Boolean).slice(0, 12) : value === null ? [] : undefined;
    case 'dutyServed': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const out = {};
      for (const [k, v] of Object.entries(value)) if (/^d-[\w-]{1,40}$/.test(k) && typeof v === 'string' && v.length <= 40) out[k] = v;
      return out;
    }
    default: return undefined;
  }
}

// Newest wins per field. Memory is a list, written as `remember`/`forget` lines
// so two runs learning at once both keep what they learned.
export function foldTeammates(lines, now = Date.now()) {
  const today = dateKey(now);
  const byId = new Map();
  for (const line of lines ?? []) {
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
        if (v <= today && v > t.served) t.served = v;
        continue;
      }
      // What each duty has served is kept per duty, so two runs marking two
      // duties at once both land.
      if (field === 'dutyServed') {
        t.dutyServed = { ...(t.dutyServed ?? {}), ...v };
        continue;
      }
      t[field] = v;
    }
    const r = patch.remember;
    if (r && typeof r === 'object' && typeof r.id === 'string' && cleanText(r.text, 300) && !t.memory.some((m) => m.id === r.id)) {
      t.memory.push({ id: r.id, text: cleanText(r.text, 300), from: cleanText(r.from, 300), at: Number.isFinite(r.at) ? r.at : ts, by: typeof r.by === 'string' ? r.by : null });
    }
    if (typeof patch.forget === 'string') t.memory = t.memory.filter((m) => m.id !== patch.forget);
  }
  return [...byId.values()]
    .filter((t) => !t.endedAt && t.name)
    .sort((a, b) => a.createdAt - b.createdAt);
}

// A free letter for a new teammate: its own initial when nobody has it, else
// the next letter of its name, else the first free one.
export function letterFor(name, teammates = []) {
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
export function foldPlaybooks(lines) {
  const books = new Map();
  const lessonBook = new Map();
  for (const line of lines ?? []) {
    if (!line || typeof line !== 'object' || !Number.isFinite(line.ts)) continue;
    if (line.kind === 'book' && typeof line.id === 'string' && cleanText(line.title, 120)) {
      const had = books.get(line.id);
      if (had) { had.title = cleanText(line.title, 120); had.updatedAt = Math.max(had.updatedAt, line.ts); continue; }
      books.set(line.id, { id: line.id, title: cleanText(line.title, 120), readers: [], lessons: [], updatedAt: line.ts });
      continue;
    }
    const book = books.get(line.book);
    if (line.kind === 'lesson' && book && typeof line.id === 'string' && cleanText(line.text, 400) && !book.lessons.some((l) => l.id === line.id)) {
      const from = line.from && typeof line.from === 'object' && typeof line.from.id === 'string'
        ? { product: String(line.from.product ?? ''), id: line.from.id, title: cleanText(line.from.title, 200) ?? '' } : null;
      book.lessons.push({ id: line.id, text: cleanText(line.text, 400), ts: line.ts, by: typeof line.by === 'string' ? line.by : null, from });
      lessonBook.set(line.id, book);
      if (isTeammateId(line.by) && !book.readers.includes(line.by)) book.readers.push(line.by);
      book.updatedAt = Math.max(book.updatedAt, line.ts);
    } else if (line.kind === 'reader' && book && isTeammateId(line.teammate) && !book.readers.includes(line.teammate)) {
      book.readers.push(line.teammate);
      book.updatedAt = Math.max(book.updatedAt, line.ts);
    } else if (line.kind === 'forget' && lessonBook.has(line.id)) {
      const b = lessonBook.get(line.id);
      b.lessons = b.lessons.filter((l) => l.id !== line.id);
      b.updatedAt = Math.max(b.updatedAt, line.ts);
    }
  }
  return [...books.values()];
}

// ---------------------------------------------------------------- the chat

export const CHAT_KINDS = ['msg', 'pass', 'seen', 'act'];

export function foldChat(lines) {
  const messages = [];
  const seen = new Set();
  // Run id to the messages read into it, and when.
  const into = new Map();
  const ids = new Set();
  for (const line of lines ?? []) {
    if (!line || typeof line !== 'object' || !CHAT_KINDS.includes(line.kind)) continue;
    if (!Number.isFinite(line.ts)) continue;
    if (line.kind === 'seen') {
      if (typeof line.ref === 'string' && typeof line.for === 'string') {
        seen.add(seenKey(line.ref, line.for));
        if (typeof line.run === 'string') {
          if (!into.has(line.run)) into.set(line.run, []);
          into.get(line.run).push({ ref: line.ref, for: line.for, ts: line.ts });
        }
      }
      continue;
    }
    if (typeof line.id !== 'string' || ids.has(line.id)) continue;
    ids.add(line.id);
    messages.push(line);
  }
  messages.sort((a, b) => a.ts - b.ts);
  return { messages, seen, into };
}

export function seenKey(msgId, teammateId) {
  return `${msgId}>${teammateId}`;
}

// Who a message is addressed to: the ones it names with @, matched on name.
export function mentionsIn(text, teammates = []) {
  const out = [];
  const lower = String(text ?? '').toLowerCase();
  for (const t of teammates) {
    if (!t.name) continue;
    const re = new RegExp(`(^|[^\\w])@${t.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(lower)) out.push(t.id);
  }
  return out;
}

// ---------------------------------------------------------------- runs

export function runsOf(teammateId, items) {
  return (items ?? []).filter((i) => teammateIdOf(i) === teammateId);
}

// A finished word from the agent that the person has not answered: the run is
// waiting on them, and so in Needs you, not running.
export function waitingOnYou(item) {
  if (!item || item.status === 'done' || item.status === 'claimed') return false;
  // Queued behind another run, or closed quietly: neither is in your inbox.
  if (item.start === 'later' || (item.labels ?? []).includes('clean')) return false;
  if (item.status === 'blocked') return true;
  const r = item.wrote?.result;
  if (!r || r.source !== 'agent') return false;
  const a = item.wrote?.answer?.ts ?? 0;
  return r.ts > a;
}

// A duty stops waking once this many of its results in a row reached you and
// sat a day unanswered; your answer or close on any of them starts it again.
export const UNREAD_HOLD = 3;

export function dutyUnread(teammateId, dutyId, items, now = Date.now()) {
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

export function isQueued(item) {
  return item?.status === 'open' && item?.start === 'later';
}

// Running or about to: one at a time per teammate, so this is what the queue
// waits behind.
export function isActiveRun(item) {
  if (!item || item.status === 'done') return false;
  if (isQueued(item)) return false;
  return !waitingOnYou(item);
}

export function activeRunOf(teammateId, items) {
  return runsOf(teammateId, items).find(isActiveRun) ?? null;
}

export function runsThisWeek(teammateId, items, now = Date.now()) {
  return runsOf(teammateId, items).filter((i) => (i.createdAt ?? 0) > now - WEEK_MS).length;
}

// Deterministic, so a tick that dies after creating the run and before marking
// the message seen finds the same row next time rather than making a second.
export function runIdFor(seed) {
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
function talkingRuns(chat) {
  const byId = new Map((chat?.messages ?? []).map((m) => [m.id, m]));
  const links = new Map();
  const link = (a, b, ts) => {
    if (!links.has(a)) links.set(a, new Map());
    if ((links.get(a).get(b) ?? -1) < ts) links.get(a).set(b, ts);
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
export function handOffText(m) {
  return [m.title ? `**${m.title}**` : null, String(m.details ?? '').trim() || null].filter(Boolean).join('\n\n') || 'Work passed on';
}

function clip(text, max) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function runTitle(trigger, teammate) {
  if (trigger.kind === 'schedule') return trigger.label === 'week' ? "This week's round" : "Today's round";
  if (trigger.kind === 'duty') return clip(trigger.what, 120);
  if (trigger.kind === 'pass') return clip(trigger.title || 'Work passed on', 120);
  // Inbox rows lead with the teammate's name, so a title never repeats it.
  if (trigger.opening === 'setup') return 'Set up its job';
  if (trigger.opening === 'start') return 'Introduce itself and begin';
  const said = partFor(trigger.text, teammate.name) || firstLine(trigger.text) || 'A message';
  return clip(trigger.fromName ? `From ${trigger.fromName}: ${said}` : said, 120);
}

const firstLine = (text) => String(text ?? '').trim().split('\n')[0].trim();

// What a message says to one teammate it names: from its @Name to the end of
// that sentence, when there is anything there.
function partFor(text, name) {
  const words = String(text ?? '');
  const at = name ? words.search(new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i')) : -1;
  if (at < 0) return null;
  const rest = words.slice(at + name.length + 1).replace(/^[\s,:;–—-]+/, '');
  const part = rest.split(/\n|\s@\w/)[0].replace(/[\s.,;:]+$/, '').trim();
  return part ? part[0].toUpperCase() + part.slice(1) : null;
}

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
export function planWakes({ teammates = [], chat = { messages: [], seen: new Set() }, items = [], now = Date.now(), shipped = {} } = {}) {
  const actions = [];
  const live = teammates.filter((t) => !t.endedAt);
  const byId = new Map(live.map((t) => [t.id, t]));
  const pendingNew = new Map();
  const startsNow = new Map();
  const limited = new Set();

  const talking = talkingRuns(chat);
  // Runs made this tick, so a second hand-off in the same tick finds the first.
  const made = [];
  const homeOf = (t, m) => {
    const runs = [...runsOf(t.id, items), ...made.filter((r) => r.teammate === t.id)];
    const partners = talking.get(m.run);
    const partner = partners && runs.filter((r) => partners.has(r.id)).sort((a, b) => partners.get(b.id) - partners.get(a.id))[0];
    if (partner) return partner;
    const where = m.product ?? t.product ?? null;
    return runs.filter((r) => m.work && workOf(r) === m.work && (!where || !r.product || r.product === where))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? null;
  };
  const closedByYou = (r) => r.status === 'done' && r.wrote?.status?.source === 'founder';

  const active = (t) => !!activeRunOf(t.id, items) || startsNow.get(t.id);
  const overLimit = (t) => runsThisWeek(t.id, items, now) + (pendingNew.get(t.id) ?? 0) >= (t.limit ?? DEFAULT_LIMIT);

  // A held run waits for your reply, not for its turn, so it neither queues
  // nor holds up the teammate's next run.
  const newRun = (t, trigger, seed, { fromYou = false, hold = false } = {}) => {
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
    const targets = m.kind === 'pass' ? [m.to] : (Array.isArray(m.to) ? m.to : []);
    for (const tid of targets) {
      const t = byId.get(tid);
      if (!t || chat.seen.has(seenKey(m.id, tid))) continue;
      if (m.from === tid) { actions.push({ type: 'seen', msg: m.id, teammate: tid }); continue; }
      if (t.paused && m.from !== YOU) continue;
      const fromYou = m.from === YOU;
      if (!fromYou && m.kind === 'msg') { actions.push({ type: 'seen', msg: m.id, teammate: tid }); continue; }
      const hop = fromYou ? 0 : (Number.isInteger(m.hop) ? m.hop : 0) + 1;
      if (hop > MAX_HOPS) {
        actions.push({ type: 'seen', msg: m.id, teammate: tid });
        actions.push({ type: 'hops', teammate: tid, msg: m.id, from: m.from });
        continue;
      }
      // A new thread to a teammate is new work, never an answer to its last question.
      if (fromYou && m.kind === 'msg' && !m.fresh) {
        const runs = runsOf(tid, items);
        const waiting = runs.filter(waitingOnYou).sort((a, b) => (b.wrote?.result?.ts ?? 0) - (a.wrote?.result?.ts ?? 0))[0];
        // A running run hears your words only if your words started it;
        // anything else is new work, queued behind it.
        const yours = new Set((chat.messages ?? []).filter((x) => x.kind === 'msg' && x.from === YOU && x.id !== m.id).map((x) => runIdFor(`${x.id}>${tid}`)));
        const running = runs.find((i) => isActiveRun(i) && i.status === 'claimed' && yours.has(i.id));
        const into = waiting ?? running;
        if (into) {
          actions.push({ type: 'answer', teammate: tid, item: into.id, product: into.product, text: m.text, msg: m.id });
          actions.push({ type: 'seen', msg: m.id, teammate: tid, run: into.id });
          continue;
        }
      }
      // `yours`: the primary passing on what your own words asked of it.
      const hold = !fromYou && !m.yours && t.handoffsNeedYes !== false;
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
      const trigger = m.kind === 'pass'
        ? { kind: 'pass', from: m.from, title: m.title, details: m.details, msg: m.id, hop, ...origin, ...(work ? { work } : {}), ...(hold ? { hold } : {}) }
        : { kind: 'message', from: m.from, text: m.text, msg: m.id, hop, ...origin, ...(work ? { work } : {}), ...(fromYou && m.start ? { opening: 'start' } : fromYou && m.setup ? { opening: 'setup' } : {}) };
      const id = newRun(t, trigger, `${m.id}>${tid}`, { fromYou, hold });
      if (id) {
        actions.push({ type: 'seen', msg: m.id, teammate: tid, run: id });
        made.push({ id, teammate: tid, product: m.product ?? t.product ?? null, status: 'open', labels: [`${WORK_LABEL_PREFIX}${work ?? id}`] });
        if (typeof m.run === 'string') {
          if (!talking.has(m.run)) talking.set(m.run, new Map());
          talking.get(m.run).set(id, now);
        }
      }
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
      let key = null;
      if (d.after === 'ship') {
        const at = shipped?.[t.product];
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

  for (const t of live) {
    if (t.paused || active(t)) continue;
    const next = runsOf(t.id, items).filter(isQueued).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0];
    if (next) actions.push({ type: 'release', teammate: t.id, item: next.id, product: next.product });
  }

  for (const tid of limited) actions.push({ type: 'limit', teammate: tid });
  return actions;
}

// ---------------------------------------------------------------- what you see

function verbFor(item, teammates) {
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
export function stoppedByYou(item) {
  return item?.status === 'done' && item.note === STOPPED_NOTE && item.wrote?.note?.ts === item.wrote?.status?.ts;
}

// The lines a run leaves in the chat, read straight off the ledger so they can
// never disagree with it: picked up (or passed on), sent you, finished.
export function runLines(items, teammates = []) {
  const out = [];
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

function startOfDay(now) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// The panel beside a teammate: what is waiting on you, what it is on now, and
// what it finished today.
export function statusOf(teammate, items, now = Date.now()) {
  const runs = runsOf(teammate.id, items);
  const waiting = runs.filter(waitingOnYou).map((i) => ({ id: i.id, product: i.product, title: i.label || i.title }));
  const running = runs.find((i) => isActiveRun(i));
  const next = runs.filter(isQueued).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)).map((i) => ({ id: i.id, product: i.product, title: i.label || i.title }));
  const queued = next.length;
  const today = startOfDay(now);
  const done = runs
    .filter((i) => i.status === 'done' && (i.wrote?.status?.ts ?? i.updatedAt ?? 0) >= today)
    .map((i) => ({ id: i.id, product: i.product, title: i.label || i.title }));
  let now_ = null;
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
export function starterAsks(team = []) {
  return STARTERS.filter((s) => !team.some((t) => t.starter === s.starter || t.name === s.name))
    .map((s) => ({ starter: s.starter, ask: s.ask, name: s.name, role: s.role }));
}

// Above the app's default, Medium: a teammate works with nobody watching.
export const TEAMMATE_EFFORT = 'high';

export const STARTERS = [
  {
    starter: 'chief', name: 'Chief of staff', role: 'Chief of staff', primary: true,
    ask: 'Be the one I talk to',
    outcome: 'Takes anything you send, gets it to the right teammate, and checks in with only what needs you',
    sends: 'One check-in a weekday with what needs you',
    job: 'Be the person\'s main point of contact. Take whatever they send you: hand it to the teammate whose job it is, do it yourself when it is small or nobody\'s, and offer a new teammate when a kind of work keeps coming and nobody owns it. Every weekday morning check in once with what is waiting on them, most urgent first, what finished and what is stuck. Stay quiet when nothing needs them.',
    goal: 'You never have to chase a teammate',
    counted: 'Things you had to chase yourself',
    asksFirst: 'Before making a new teammate, or handing on work you did not ask for',
    works: { every: 'weekday', at: '09:00' },
  },
  {
    starter: 'quality', name: 'Quality lead', role: 'Quality lead',
    ask: 'Find bugs before your users do',
    outcome: 'Finds bugs before your users do',
    sends: 'A bug, with the steps to make it happen',
    job: 'Use the project the way a new user would, every weekday morning. Try the main flows on a phone-sized window and a slow connection. File anything broken with the exact steps to make it happen, and pass fixable bugs to whoever fixes things on the team.',
    goal: 'Nothing broken reaches a user',
    counted: 'Bugs users report that you did not find first',
    asksFirst: 'Before paying with a real card or signing in as a real person',
    works: { every: 'weekday', at: '09:00' },
  },
  {
    starter: 'maintainer', name: 'Maintainer', role: 'Maintainer',
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
    starter: 'marketing', name: 'Marketing lead', role: 'Marketing lead',
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
    starter: 'support', name: 'Support lead', role: 'Support lead',
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
    starter: 'growth', name: 'Growth lead', role: 'Growth lead',
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
    starter: 'fundraising', name: 'Fundraiser', role: 'Fundraiser',
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
// When you keep asking for the same kind of thing, the app offers a teammate
// for it: one inbox row, which no agent ever runs, answered by a tap.
export const OFFER_LABEL = 'teammate-offer';
export const OFFER_MAKE = 'Make a teammate for it';
export const OFFER_NOT_NOW = 'Not now';
const OFFER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const OFFER_AT_LEAST = 3;
const STOP = new Set(('the a an and or but for to of in on at by with from into onto about as is are was were be been it its this that these those '
  + 'my our your their me we you i us can could would should will please pls just also some any all new more make do does did get got let lets '
  + 'need want like have has had what which who how why when where there here then than them they not no yes ok okay one two three today tomorrow week').split(' '));

function wordsOf(title) {
  return new Set(String(title ?? '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

function alike(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared >= 2 && shared / Math.min(a.size, b.size) >= 0.6;
}

// Threads you wrote yourself in the last month: not a teammate's or a repeat's
// runs, not imported, not an offer.
function yourAsks(items, now) {
  return (items ?? []).filter((i) => {
    const labels = i.labels ?? [];
    if (!labels.includes('founder') || i.wrote?.labels?.source === 'agent') return false;
    if (labels.some((l) => /^(teammate|repeat|hop|from):/.test(l) || l === OFFER_LABEL || l === 'thread-import' || l === 'codex-import' || l === 'codex')) return false;
    return now - (i.createdAt ?? 0) <= OFFER_WINDOW_MS && wordsOf(i.title).size >= 2;
  });
}

/**
 * The offer to make now, if any: three or more of your own asks this month
 * alike enough to be one job, under a key no offer has used. One open offer at
 * a time, and one a day at most.
 */
function askedOnce(group) {
  const seen = new Map();
  for (const i of group) {
    const title = String(i.label || i.title).trim();
    const had = seen.get(title.toLowerCase());
    if (had) had.n += 1; else seen.set(title.toLowerCase(), { title, n: 1 });
  }
  return [...seen.values()];
}

export function offerFrom({ items = [], offered = new Set(), now = Date.now() } = {}) {
  const open = (items ?? []).filter((i) => (i.labels ?? []).includes(OFFER_LABEL));
  if (open.some((i) => i.status !== 'done' || now - (i.createdAt ?? 0) < 24 * 60 * 60 * 1000)) return null;
  const asks = yourAsks(items, now).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const bags = new Map(asks.map((i) => [i.id, wordsOf(i.title)]));
  for (const lead of asks) {
    const group = asks.filter((i) => i === lead || alike(bags.get(lead.id), bags.get(i.id)));
    if (group.length < OFFER_AT_LEAST) continue;
    const counts = new Map();
    for (const i of group) for (const w of bags.get(i.id)) counts.set(w, (counts.get(w) ?? 0) + 1);
    const common = [...counts].filter(([, n]) => n >= Math.ceil(group.length / 2)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([w]) => w);
    const key = common.sort().join('-');
    if (!key || offered.has(key)) continue;
    const byProduct = new Map();
    for (const i of group) byProduct.set(i.product, (byProduct.get(i.product) ?? 0) + 1);
    const product = [...byProduct].sort((a, b) => b[1] - a[1])[0]?.[0] ?? lead.product;
    return {
      key, product, count: group.length,
      // The same words asked again are one line, not five.
      titles: [...new Map(group.map((i) => [String(i.label || i.title).trim().toLowerCase(), String(i.label || i.title).trim()])).values()].slice(0, 5),
      asked: askedOnce(group).slice(0, 5),
      threads: group.slice(0, OFFER_THREADS).map((i) => ({ product: i.product, id: i.id, title: String(i.label || i.title).trim() })),
      title: `Want a teammate for things like “${clip(lead.label || lead.title, 60)}”?`,
      said: `You've asked for this ${group.length} times this month.`,
    };
  }
  return null;
}

const OFFER_THREADS = 12;

// ---------------------------------------------------------------- the method
// A teammate's method is one file it keeps and reads whole every run: what
// the job is, how it is done, what the person approved and turned down in
// their words, and what needs their yes. Past this it is cut with a mark.
export const METHOD_CAP = 16_000;

const KEYS = /\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,})\b/g;
const redact = (text) => String(text ?? '').replace(KEYS, '[key removed]');
const cutText = (text, most) => (text.length > most ? `${text.slice(0, most).trimEnd()}… (cut, ${text.length - most} more characters)` : text);

/**
 * One thread written out for a teammate to learn from: every word the person
 * said and every answer the agent gave, in order. A thread too long for `cap`
 * loses the agent's words first; the person's are kept whole.
 */
export function sourceText(thread, turns, { cap = 80_000 } = {}) {
  const said = (turns ?? []).filter((x) => (x.source === 'founder' || x.source === 'agent') && String(x.text ?? '').trim());
  const render = (agentMost) => [
    `# ${thread.title} (${thread.product}/${thread.id})`,
    ...said.map((x) => (x.source === 'founder'
      ? `## You\n\n${redact(x.text.trim())}`
      : `## The agent\n\n${cutText(redact(x.text.trim()), agentMost)}`)),
  ].join('\n\n');
  for (const most of [Infinity, 6000, 1500, 400]) {
    const text = render(most);
    if (text.length <= cap) return text;
  }
  return `${render(400).slice(0, cap - 90)}\n\n… (cut here: this thread is longer than ${cap} characters)`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECORD_DAYS = 21;

const headline = (text) => clip(String(text ?? '').split('\n').map((l) => l.replace(/\*\*|__|`|^#+\s*/g, '').trim()).find(Boolean) ?? '', 240);

/**
 * The record of a teammate's recent work, read off the ledger: each run of the
 * last three weeks, oldest first, with every word the person said on it and
 * the first line of its last answer. A quiet run the person never spoke on is
 * left out. Past `cap` the oldest runs go first. `read(product, id)` gives a
 * thread's turns.
 */
export function recordOf(runs, read, { now = Date.now(), cap = 8000, days = RECORD_DAYS } = {}) {
  const since = now - days * DAY_MS;
  const entries = [];
  const ordered = [...(runs ?? [])].filter((r) => (r.createdAt ?? 0) >= since).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  for (const r of ordered) {
    let turns = [];
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
export function offerAnswer(answer) {
  const said = String(answer ?? '').trim();
  if (!said || said === '(withdrawn)') return null;
  if (/not now|^no\b|^2\.?$/i.test(said)) return { kind: 'dismiss' };
  if (said.toLowerCase().includes(OFFER_MAKE.toLowerCase()) || /^1\.?$/.test(said) || /^(yes|yep|sure|ok|okay)\b/i.test(said)) return { kind: 'make' };
  return { kind: 'make', words: said };
}
