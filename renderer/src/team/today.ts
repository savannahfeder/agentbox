// The Today page: what each person and AI teammate finished, shipped and
// decided, what is blocked and on whom, and what waits on you, read from the
// store with no agent.
import { cardStateOf, shippedAtOf, type WontStart } from '../../../shared/thread-cards.mts';
import { agentOnOrComing } from '../list-rules';
import { shownTitle, withoutFiles } from '../../../shared/thread-title.mts';
import { isShared, isTaskRow, runnerOf, taskNewsAt } from '../../../shared/team-rules.mts';
import { isSetupTitle } from '../../../shared/teammates.mts';
import { waitParts } from '../../../shared/thread-waits.mts';
import { blockedWords, deadlineOf, dueSaid } from '../../../shared/team-tasks.mts';
import { shownPriority } from '../../../shared/rank.mts';
import { priorityIdOf, priorityLabelOf } from '../priority';
import { clock } from '../thread-history';
import type { Product, RoomDecision, RoomMention, ThreadCard, WorkItem } from '../types';

export type TodayRange = 'today' | 'yesterday' | 'week';

const DAY = 86_400_000;
/** Lines a section draws before "and N more". */
export const SHOWN = 4;

/** A line's time: the clock within a day, and in This week the day, said as Today or Yesterday when it is. */
export function lineWhen(at: number, range: TodayRange, now: number): string {
  const d = new Date(at);
  if (range !== 'week') return clock(at);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export function rangeOf(range: TodayRange, now: number): { from: number; to: number } {
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  if (range === 'yesterday') return { from: new Date(midnight - DAY / 2).setHours(0, 0, 0, 0), to: midnight };
  if (range === 'week') {
    const d = new Date(midnight);
    d.setDate(d.getDate() - 6);
    return { from: d.getTime(), to: Infinity };
  }
  return { from: midnight, to: Infinity };
}

export interface TodayLine {
  key: string; title: string; at: number;
  item?: WorkItem; card?: ThreadCard; roomId?: string; mention?: RoomMention;
  /** An approved file, by its Files key. */
  file?: string;
  /** Whom a blocked line waits on. */
  on?: string | null;
  /** How far it got, in its own words. */
  says?: string;
  /** A task's deadline, said as the row says it, and what blocks it. */
  due?: { word: string; late: boolean; at: number };
  blocked?: string;
  /** Urgent or High; the other levels are not said. */
  level?: string;
}

export interface TodayPerson {
  key: string; name: string; kind: 'me' | 'person' | 'mate';
  finished: TodayLine[]; shipped: TodayLine[]; decided: TodayLine[]; blocked: TodayLine[]; waitingOnYou: TodayLine[];
  /** Open threads that moved in the range. */
  working: TodayLine[];
  /** A teammate's open threads that moved in the range and wait on them, not on an agent. */
  waiting?: TodayLine[];
  /** Every open task they hold, whatever the range. */
  tasks: TodayLine[];
  /** Private threads they finished: counted, never named. */
  privateDone: number;
}

export interface TodayCounts { needYou: number; blocked: number; shipped: number; listed?: number }

/** A file someone approved: a decision as plain as a marked message. */
export interface TodayApproval { key: string; name: string; by: string | null; at: number; threads?: string[] }

const SAYS_MOST = 80;
// Progress is a trail of steps, one a line; the last is how far it got.
const howFar = (words: string | null | undefined) => {
  const steps = String(words ?? '').split('\n').map((l) => l.replace(/^\s*(?:[-*•✓]\s*)?/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const one = steps[steps.length - 1] ?? '';
  if (!one) return undefined;
  return one.length > SAYS_MOST ? `${one.slice(0, SAYS_MOST).trimEnd()}…` : one;
};

type Needs = Pick<WorkItem, 'id' | 'product' | 'labels' | 'createdBy' | 'title' | 'updatedAt'> & Partial<WorkItem>;

const first = (name: string) => name.split(/\s+/)[0] || name;
/** A teammate's name is its job ("Chief of staff"), so only a person is cut to a first name. */
const quietName = (p: { kind: string; name: string }) => (p.kind === 'mate' ? p.name : first(p.name));
const oneLine = (s: string) => {
  const line = withoutFiles(s).split('\n').find((l) => l.trim())?.trim() || 'Sent a file';
  return line.length > 110 ? `${line.slice(0, 108).replace(/\s+\S*$/, '')}…` : line;
};

export function teamToday({ range, now, me, items, products, cards, decisions, needs, mentions = [], approvals = [], people, mates, mateOf, directWith = () => null, needsCount, later = () => false, supervisor = {}, undoing = new Set() }: {
  /** This computer's supervisor, which says what it will not start; it rules your own threads, never a teammate's card. */
  supervisor?: WontStart & { running?: readonly { itemId: string }[]; starting?: readonly string[] };
  /** Your rows whose move is held in the undo window: out of Needs you already, not yet written. */
  undoing?: ReadonlySet<string>;
  /** Your own threads put off till later, by this app's own rule (which this computer keeps). */
  later?: (item: WorkItem) => boolean;
  range: TodayRange; now: number; me: string | null;
  items: readonly WorkItem[]; products: readonly Product[]; cards: readonly ThreadCard[];
  decisions: readonly RoomDecision[];
  /** The rows in your Needs you. */
  needs: readonly Needs[]; mentions?: readonly RoomMention[];
  approvals?: readonly TodayApproval[];
  /** The others on the team. */
  people: readonly { id: string; name: string }[];
  mates: readonly { id: string; name: string }[];
  mateOf: (row: Needs) => string | null;
  /** The person a direct conversation is with, by its project. */
  directWith?: (product: string) => string | null;
  /** The Needs you tab's own number, so the two never disagree. */
  needsCount?: number;
}): { people: TodayPerson[]; quiet: string[]; counts: TodayCounts } {
  const { from, to } = rangeOf(range, now);
  const inRange = (t: number | null | undefined) => !!t && t >= from && t < to;
  const direct = new Set(products.filter((p) => p.team?.direct).map((p) => p.slug));
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  // A shared project's thread is in your store when a teammate's Mac runs it; their card says it.
  const runBy = (i: WorkItem) => {
    const product = bySlug.get(i.product);
    return isShared(product) && !product?.team?.direct ? runnerOf(i, product) : me;
  };
  const byKey = new Map<string, TodayPerson>();
  const order: string[] = [];
  const add = (key: string, name: string, kind: TodayPerson['kind']) => {
    byKey.set(key, { key, name, kind, finished: [], shipped: [], decided: [], blocked: [], waitingOnYou: [], working: [], waiting: [], tasks: [], privateDone: 0 });
    order.push(key);
  };
  add('me', 'You', 'me');
  for (const p of people) if (p.id !== me) add(`person:${p.id}`, p.name, 'person');
  for (const m of mates) add(`mate:${m.id}`, m.name, 'mate');
  const keyOfPerson = (id: string | null | undefined) => (!id ? null : id === me ? 'me' : byKey.has(`person:${id}`) ? `person:${id}` : byKey.has(`mate:${id}`) ? `mate:${id}` : null);
  const nameOf = (key: string | null) => (key === 'me' ? 'you' : key ? first(byKey.get(key)?.name ?? '') || null : null);

  // Who owns each thread a blocker can point at.
  const owner = new Map<string, string>();
  for (const c of cards) if (byKey.has(`person:${c.personId}`)) owner.set(c.threadId, `person:${c.personId}`);

  // Whose it is, for an id in blockedBy: a thread, or what Waits on wrote (shared/thread-waits.mts).
  const waitsOnKey = (id: string) => {
    const w = waitParts(id);
    return w.kind === 'thread' ? owner.get(w.thread) : w.kind === 'name' ? null : keyOfPerson(w.person);
  };
  // Whom or what a thread of `self`'s waits on: someone else, else a block in words.
  const blockOn = (ids: readonly string[], self: string): string | null => {
    const other = ids.map(waitsOnKey).find((o) => o && o !== self);
    if (other) return nameOf(other);
    const words = ids.map(waitParts).find((w) => w.kind === 'name');
    return words?.kind === 'name' ? words.name : null;
  };

  const ownKey = (i: WorkItem) => {
    const mate = i.labels?.find((l) => l.startsWith('teammate:'))?.slice('teammate:'.length);
    return mate && byKey.has(`mate:${mate}`) ? `mate:${mate}` : 'me';
  };
  for (const i of items) {
    if (i.agent || (direct.has(i.product) && !isTaskRow(i))) continue;
    const runner = runBy(i);
    if (runner !== me) { const k = keyOfPerson(runner); if (k) owner.set(i.id, k); continue; }
    owner.set(i.id, ownKey(i));
  }

  const inNeeds = new Set(needs.map((n) => `${n.product}/${n.id}`));
  const blockCtx = { items: items as WorkItem[], cards: cards as ThreadCard[], me, nameOf: (id: string) => byKey.get(`person:${id}`)?.name ?? 'Someone' };
  const level = (priority: number | null | undefined) => {
    const id = priorityIdOf(priority);
    return id === 'urgent' || id === 'high' ? { level: priorityLabelOf(id) } : {};
  };
  const dueOf = (d: { at: number; clock: boolean } | null) => {
    const w = dueSaid(d, now, { ahead: true });
    return w && d ? { due: { ...w, at: d.at } } : {};
  };
  const taskLine = (i: WorkItem, l: TodayLine): TodayLine => {
    const b = blockedWords(i, blockCtx);
    return { ...l, ...dueOf(deadlineOf(i, me)), ...(b ? { blocked: b.on } : {}), ...level(shownPriority(i)) };
  };
  const localTasks = new Set(items.filter((i) => isTaskRow(i)).map((i) => i.id));
  const agentOn = agentOnOrComing(supervisor);
  for (const i of items) {
    // A teammate's "Set up …" thread is often its first day of work; its title says nothing of that work, its progress does.
    if (i.agent || i.title === 'Set up its job') continue;
    const setupSays = isSetupTitle(i.title) && i.labels?.some((l) => l.startsWith('teammate:')) ? howFar(i.progress) : undefined;
    const task = isTaskRow(i);
    if (direct.has(i.product) && !task) continue;
    if (runBy(i) !== me) continue;
    // A task someone gave you is theirs to say finished; open, it is one of yours.
    if (task && i.createdBy && i.createdBy !== me) {
      if (i.status !== 'done' && !inNeeds.has(`${i.product}/${i.id}`)) byKey.get('me')!.tasks.push(taskLine(i, { key: `${i.product}/${i.id}`, title: '', at: i.updatedAt, item: i }));
      continue;
    }
    const k = owner.get(i.id) ?? 'me';
    const who = byKey.get(k)!;
    const line = (at: number, on?: string | null): TodayLine => ({ key: `${i.product}/${i.id}`, title: '', at, item: i, ...(on !== undefined ? { on } : {}), ...(setupSays ? { says: setupSays } : {}) });
    const shipped = shippedAtOf(i);
    if (inRange(shipped)) { who.shipped.push(line(shipped!)); continue; }
    if (i.status === 'done') {
      const doneAt = i.wrote?.status?.ts ?? i.updatedAt;
      // A task you gave is finished by whoever closed it, in their words, not yours.
      const closer = task ? keyOfPerson(i.wrote?.status?.by) : null;
      if (inRange(doneAt)) (closer && closer !== 'me' ? byKey.get(closer)! : who).finished.push(line(doneAt));
      continue;
    }
    if (inNeeds.has(`${i.product}/${i.id}`) || undoing.has(i.id)) continue;
    if (task) {
      const holder = byKey.get(keyOfPerson(i.assignee) ?? '');
      if (holder) holder.tasks.push(taskLine(i, line(taskNewsAt(i, null))));
      continue;
    }
    const card = cardStateOf(i, { now, live: agentOn.has(i.id), wontStart: supervisor });
    const on = blockOn([...(card.waitsOn ? [card.waitsOn] : []), ...(i.blockedBy ?? [])], k);
    if (on) who.blocked.push(line(i.updatedAt, on));
    else if (i.status === 'blocked') who.blocked.push(line(i.updatedAt, null));
    // A thread put off till later is not being worked on.
    else if (inRange(i.updatedAt) && !task && card.state !== 'scheduled' && !card.held && !later(i)) {
      const says = howFar(i.progress);
      who.working.push({ ...line(i.updatedAt), ...(says ? { says } : {}) });
    }
  }

  // A teammate's card for a task between you is the row above, not more work.
  for (const c of cards) {
    const who = byKey.get(`person:${c.personId}`);
    if (!who || c.title === 'Set up its job' || c.title === 'Set up a new teammate') continue;
    if (c.task) {
      if (localTasks.has(c.threadId) || c.title == null) continue;
      const line: TodayLine = { key: `card/${c.personId}/${c.threadId}`, title: c.title, at: c.updatedAt, card: c };
      if (c.state === 'done') { if (inRange(c.updatedAt)) who.finished.push(line); continue; }
      const b = blockedWords({ id: c.threadId, labels: ['given-task'], status: 'open', blockedBy: c.blockedBy.map((x) => x.id) }, blockCtx);
      who.tasks.push({ ...line, ...dueOf(Number.isFinite(c.task.dueAt) ? { at: c.task.dueAt!, clock: !!c.task.clock } : null), ...(b ? { blocked: b.on } : {}), ...level(c.priority) });
      continue;
    }
    if (localTasks.has(c.threadId)) continue;
    const named = c.visible && c.title != null;
    const line: TodayLine = { key: `card/${c.personId}/${c.threadId}`, title: c.title ?? '', at: c.updatedAt, card: c };
    if (inRange(c.shippedAt)) { if (named) who.shipped.push({ ...line, at: c.shippedAt! }); else who.privateDone += 1; continue; }
    if (c.state === 'done') {
      if (inRange(c.updatedAt)) { if (named) who.finished.push(line); else who.privateDone += 1; }
      continue;
    }
    if (!named) continue;
    const on = blockOn(c.blockedBy.map((b) => b.id), who.key);
    if (on) who.blocked.push({ ...line, on });
    else if (inRange(c.updatedAt) && c.state !== 'scheduled') {
      const says = howFar(c.progress);
      (c.state === 'running' ? who.working : who.waiting!).push({ ...line, ...(says ? { says } : {}) });
    }
  }

  for (const d of decisions) {
    if (!d.on || d.kind !== 'decision' || !inRange(d.at)) continue;
    const who = byKey.get(keyOfPerson(d.saidBy ?? d.by) ?? '');
    if (who) who.decided.push({ key: `decision/${d.roomId}/${d.messageId}`, title: oneLine(d.body), at: d.at, roomId: d.roomId });
  }

  for (const a of approvals) {
    // Still in Needs you, it is said once, as what waits.
    if (!inRange(a.at) || a.threads?.some((t) => inNeeds.has(t))) continue;
    const who = byKey.get(keyOfPerson(a.by) ?? '');
    if (who) who.decided.push({ key: `approved/${a.key}`, title: `Approved ${a.name}`, at: a.at, file: a.key });
  }

  // Your own agents' asks are yours, so every row the count names has a line.
  for (const n of needs) {
    const mate = mateOf(n);
    const from = mate ? `mate:${mate}` : keyOfPerson(n.createdBy && n.createdBy !== me ? n.createdBy : directWith(n.product)) ?? 'me';
    const who = byKey.get(from);
    if (!who) continue;
    const line: TodayLine = { key: `${n.product}/${n.id}`, title: shownTitle(n), at: isTaskRow(n) ? taskNewsAt(n, me) : n.updatedAt, item: n as WorkItem };
    who.waitingOnYou.push(isTaskRow(n) ? taskLine(n as WorkItem, line) : line);
  }
  for (const m of mentions) {
    const who = byKey.get(keyOfPerson(m.by) ?? '');
    if (who && who.key !== 'me') who.waitingOnYou.push({ key: `mention/${m.id}`, title: oneLine(m.body), at: m.at, roomId: m.roomId, mention: m });
  }

  const newest = (a: TodayLine, b: TodayLine) => b.at - a.at;
  // Late first, then the soonest due, then the rest newest first.
  const byDue = (a: TodayLine, b: TodayLine) => (Number(!!b.due?.late) - Number(!!a.due?.late))
    || ((a.due?.at ?? Infinity) - (b.due?.at ?? Infinity)) || newest(a, b);
  const all = order.map((k) => byKey.get(k)!);
  // Titles only for the lines a section draws: a week on a big store finishes thousands.
  for (const p of all) {
    p.tasks.sort(byDue);
    for (const list of [p.finished, p.shipped, p.decided, p.blocked, p.waitingOnYou, p.working, p.waiting!, p.tasks]) {
      if (list !== p.tasks) list.sort(newest);
      for (const l of list.slice(0, SHOWN)) if (!l.title && l.item) l.title = shownTitle(l.item);
    }
  }
  const says = (p: TodayPerson) => p.finished.length + p.shipped.length + p.decided.length + p.blocked.length + p.waitingOnYou.length + p.working.length + p.waiting!.length + p.tasks.length + p.privateDone > 0;
  return {
    people: all.filter(says),
    quiet: all.filter((p) => p.kind !== 'me' && !says(p)).map(quietName),
    counts: {
      needYou: needsCount ?? needs.length + mentions.filter((m) => m.by !== me).length,
      blocked: all.reduce((n, p) => n + p.blocked.length + p.tasks.filter((l) => l.blocked).length, 0),
      shipped: all.reduce((n, p) => n + p.shipped.length, 0),
      listed: all.reduce((n, p) => n + p.waitingOnYou.length, 0),
    },
  };
}

export type TodayGroup = 'working' | 'todo' | 'done' | 'blocked';

/** What the page draws per person, in standup order. */
export const GROUPS: readonly { id: TodayGroup; label: string }[] = [
  { id: 'working', label: 'Working on' }, { id: 'todo', label: 'To do' }, { id: 'done', label: 'Done' }, { id: 'blocked', label: 'Blocked' },
];

/** A drawn line: a task says its due date rather than a time, and Done says when it was not plain done. */
export interface GroupLine extends TodayLine { task?: true; tag?: string }

const byNewest = (a: TodayLine, b: TodayLine) => b.at - a.at;

/** A section's lines: all of them only in the range "and N more" was pressed in. */
export function linesShown<T>(lines: readonly T[], openedIn: TodayRange | null, range: TodayRange): readonly T[] {
  return openedIn === range ? lines : lines.slice(0, SHOWN);
}

export const EVERYONE_RANGE_KEY = 'zero.everyoneRange';
const RANGE_IDS: readonly string[] = ['today', 'yesterday', 'week'];

/** The range the Everyone page opens on: the last one picked, else This week. */
export function everyoneRange(storage: Pick<Storage, 'getItem'>): TodayRange {
  try {
    const kept = storage.getItem(EVERYONE_RANGE_KEY);
    return kept && RANGE_IDS.includes(kept) ? kept as TodayRange : 'week';
  } catch { return 'week'; }
}

export function keepEveryoneRange(storage: Pick<Storage, 'setItem'>, range: TodayRange): void {
  try { storage.setItem(EVERYONE_RANGE_KEY, range); } catch { /* private mode: it opens on This week again */ }
}

/** A person's lists folded into the three groups. What waits on you is left to Needs you. */
export function groupsOf(p: TodayPerson): Record<TodayGroup, GroupLine[]> {
  const tasks = (p.tasks ?? []).map((l): GroupLine => ({ ...l, task: true }));
  return {
    working: p.working,
    todo: [...tasks.filter((l) => !l.blocked), ...(p.waiting ?? [])],
    done: [
      ...p.shipped.map((l) => ({ ...l, tag: 'Shipped' })),
      ...p.finished,
      ...p.decided.map((l) => (l.file ? l : { ...l, tag: 'Decided' })),
    ].sort(byNewest),
    blocked: [...p.blocked, ...tasks.filter((l) => l.blocked).map((l) => ({ ...l, on: l.blocked }))],
  };
}

const drawsSomething = (p: TodayPerson) => !!p.privateDone || Object.values(groupsOf(p)).some((g) => g.length > 0);

/** The people the page draws; anyone left with only what waits on you joins the quiet ones. */
export function shownDay<T extends { people: TodayPerson[]; quiet: string[] }>(day: T): T {
  const silent = day.people.filter((p) => p.kind !== 'me' && !drawsSomething(p)).map(quietName);
  return { ...day, people: day.people.filter(drawsSomething), quiet: [...silent, ...day.quiet] };
}

export interface StepLine { id: string; line: TodayLine }

/** The lines J and K stop on: the ones drawn, in reading order. */
export function linesToStep(people: readonly TodayPerson[]): StepLine[] {
  return people.flatMap((p) => {
    const g = groupsOf(p);
    return GROUPS.flatMap(({ id }) => g[id].slice(0, SHOWN).map((line) => ({ id: `${p.key}/${id}/${line.key}`, line })));
  });
}

export function stepLine(lines: readonly StepLine[], picked: string | null, dir: 1 | -1): string | null {
  const at = lines.findIndex((l) => l.id === picked);
  if (at < 0) return lines[0]?.id ?? null;
  return lines[Math.max(0, Math.min(lines.length - 1, at + dir))].id;
}

/** The one line over the page, or nothing when nothing needs you. */
export const todayLine = (c: TodayCounts) => (c.needYou ? `${c.needYou} ${c.needYou === 1 ? 'thing needs' : 'things need'} you` : '');
