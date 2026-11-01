// The Today page: what each person and AI teammate finished, shipped and
// decided, what is blocked and on whom, and what waits on you, read from the
// store with no agent.
import { shippedAtOf } from '../../../shared/thread-cards.mjs';
import { shownTitle, withoutFiles } from '../../../shared/thread-title.mjs';
import { isTaskRow, taskNewsAt } from '../../../shared/team-rules.mjs';
import { isSetupTitle } from '../../../shared/teammates.mjs';
import { waitParts } from '../../../shared/thread-waits.mjs';
import { blockedWords, deadlineOf, dueSaid } from '../../../shared/team-tasks.mjs';
import { shownPriority } from '../../../shared/rank.mjs';
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
  /** Every open task they hold, whatever the range. */
  tasks: TodayLine[];
  /** Private threads they finished: counted, never named. */
  privateDone: number;
}

export interface TodayCounts { needYou: number; blocked: number; shipped: number; listed?: number }

/** A file someone approved: a decision as plain as a marked message. */
export interface TodayApproval { key: string; name: string; by: string | null; at: number; threads?: string[] }

const SAYS_MOST = 80;
const howFar = (words: string | null | undefined) => {
  const one = String(words ?? '').replace(/\s+/g, ' ').trim();
  if (!one) return undefined;
  return one.length > SAYS_MOST ? `${one.slice(0, SAYS_MOST).trimEnd()}…` : one;
};

type Needs = Pick<WorkItem, 'id' | 'product' | 'labels' | 'createdBy' | 'title' | 'updatedAt'> & Partial<WorkItem>;

const first = (name: string) => name.split(/\s+/)[0] || name;
const oneLine = (s: string) => {
  const line = withoutFiles(s).split('\n').find((l) => l.trim())?.trim() || 'Sent a file';
  return line.length > 110 ? `${line.slice(0, 108).replace(/\s+\S*$/, '')}…` : line;
};

export function teamToday({ range, now, me, items, products, cards, decisions, needs, mentions = [], approvals = [], people, mates, mateOf, directWith = () => null, needsCount }: {
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
  const byKey = new Map<string, TodayPerson>();
  const order: string[] = [];
  const add = (key: string, name: string, kind: TodayPerson['kind']) => {
    byKey.set(key, { key, name, kind, finished: [], shipped: [], decided: [], blocked: [], waitingOnYou: [], working: [], tasks: [], privateDone: 0 });
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

  // Whose it is, for an id in blockedBy: a thread, or what Waits on wrote (shared/thread-waits.mjs).
  const waitsOnKey = (id: string) => {
    const w = waitParts(id);
    return w.kind === 'thread' ? owner.get(w.thread) : w.kind === 'name' ? null : keyOfPerson(w.person);
  };

  const ownKey = (i: WorkItem) => {
    const mate = i.labels?.find((l) => l.startsWith('teammate:'))?.slice('teammate:'.length);
    return mate && byKey.has(`mate:${mate}`) ? `mate:${mate}` : 'me';
  };
  for (const i of items) {
    if (i.agent || (direct.has(i.product) && !isTaskRow(i))) continue;
    const k = ownKey(i);
    owner.set(i.id, k);
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
  for (const i of items) {
    if (i.agent || isSetupTitle(i.title) && (i.title === 'Set up its job' || i.labels?.some((l) => l.startsWith('teammate:')))) continue;
    const task = isTaskRow(i);
    if (direct.has(i.product) && !task) continue;
    // A task someone gave you is theirs to say finished; open, it is one of yours.
    if (task && i.createdBy && i.createdBy !== me) {
      if (i.status !== 'done' && !inNeeds.has(`${i.product}/${i.id}`)) byKey.get('me')!.tasks.push(taskLine(i, { key: `${i.product}/${i.id}`, title: '', at: i.updatedAt, item: i }));
      continue;
    }
    const k = owner.get(i.id) ?? 'me';
    const who = byKey.get(k)!;
    const line = (at: number, on?: string | null): TodayLine => ({ key: `${i.product}/${i.id}`, title: '', at, item: i, ...(on !== undefined ? { on } : {}) });
    const shipped = shippedAtOf(i);
    if (inRange(shipped)) { who.shipped.push(line(shipped!)); continue; }
    if (i.status === 'done') {
      const doneAt = i.wrote?.status?.ts ?? i.updatedAt;
      // A task you gave is finished by whoever closed it, in their words, not yours.
      const closer = task ? keyOfPerson(i.wrote?.status?.by) : null;
      if (inRange(doneAt)) (closer && closer !== 'me' ? byKey.get(closer)! : who).finished.push(line(doneAt));
      continue;
    }
    if (inNeeds.has(`${i.product}/${i.id}`)) continue;
    if (task) {
      const holder = byKey.get(keyOfPerson(i.assignee) ?? '');
      if (holder) holder.tasks.push(taskLine(i, line(taskNewsAt(i, null))));
      continue;
    }
    const on = (i.blockedBy ?? []).map(waitsOnKey).find((o) => o && o !== k);
    if (on) who.blocked.push(line(i.updatedAt, nameOf(on)));
    else if (i.status === 'blocked') who.blocked.push(line(i.updatedAt, null));
    else if (inRange(i.updatedAt) && !task) {
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
    const on = c.blockedBy.map((b) => waitsOnKey(b.id)).find((o) => o && o !== who.key);
    if (on) who.blocked.push({ ...line, on: nameOf(on) });
    else if (inRange(c.updatedAt)) {
      const says = howFar(c.progress);
      who.working.push({ ...line, ...(says ? { says } : {}) });
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
    for (const list of [p.finished, p.shipped, p.decided, p.blocked, p.waitingOnYou, p.working, p.tasks]) {
      if (list !== p.tasks) list.sort(newest);
      for (const l of list.slice(0, SHOWN)) if (!l.title && l.item) l.title = shownTitle(l.item);
    }
  }
  const says = (p: TodayPerson) => p.finished.length + p.shipped.length + p.decided.length + p.blocked.length + p.waitingOnYou.length + p.working.length + p.tasks.length + p.privateDone > 0;
  return {
    people: all.filter(says),
    quiet: all.filter((p) => p.kind !== 'me' && !says(p)).map((p) => first(p.name)),
    counts: {
      needYou: needsCount ?? needs.length + mentions.filter((m) => m.by !== me).length,
      blocked: all.reduce((n, p) => n + p.blocked.length + p.tasks.filter((l) => l.blocked).length, 0),
      shipped: all.reduce((n, p) => n + p.shipped.length, 0),
      listed: all.reduce((n, p) => n + p.waitingOnYou.length, 0),
    },
  };
}

/** A person's sections, in the order the page draws them. */
export const SECTIONS = ['waitingOnYou', 'tasks', 'blocked', 'decided', 'shipped', 'finished', 'working'] as const;

export interface StepLine { id: string; line: TodayLine }

/** The lines J and K stop on: the ones drawn, in reading order. A thread on two lists is two stops. */
export function linesToStep(people: readonly TodayPerson[]): StepLine[] {
  return people.flatMap((p) => SECTIONS.flatMap((s) => (p[s] ?? []).slice(0, SHOWN).map((line) => ({ id: `${p.key}/${s}/${line.key}`, line }))));
}

export function stepLine(lines: readonly StepLine[], picked: string | null, dir: 1 | -1): string | null {
  const at = lines.findIndex((l) => l.id === picked);
  if (at < 0) return lines[0]?.id ?? null;
  return lines[Math.max(0, Math.min(lines.length - 1, at + dir))].id;
}

const unlisted = (c: TodayCounts) => (c.listed == null ? 0 : Math.max(0, c.needYou - c.listed));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The one line over the page, in its parts: what needs you, then the rest. */
export function todayParts(c: TodayCounts): [string, ...string[]] {
  return [
    c.needYou ? `${plural(c.needYou, 'thing', 'things')} ${c.needYou === 1 ? 'needs' : 'need'} you${unlisted(c) ? `, ${unlisted(c)} of them only in Needs you` : ''}` : 'Nothing needs you',
    ...(c.blocked ? [`${c.blocked} blocked on others`] : []),
    ...(c.shipped ? [`${c.shipped} shipped`] : []),
  ];
}

export const todayLine = (c: TodayCounts) => todayParts(c).join(', ');
