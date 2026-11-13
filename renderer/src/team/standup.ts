// The Standup: one post per teammate for each standup day, written from what
// moved since the standup before it. When it happens is the person's to set.
import { shownTitle } from '../../../shared/thread-title.mts';
import { groupsOf, type TodayLine, type TodayPerson } from './today';

export interface StandupSettings {
  /** Days of the week it happens on, 0 for Sunday. */
  days: number[];
  /** When, as HH:MM: a day's post covers the work since the standup before it. */
  at: string;
  /** AI teammates post their own; off, their work is counted as yours. */
  mates: boolean;
}

export const DEFAULT_STANDUP: StandupSettings = { days: [1, 2, 3, 4, 5], at: '09:00', mates: true };
export const STANDUP_KEY = 'zero.standup';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readStandup(storage: Pick<Storage, 'getItem'>): StandupSettings {
  try {
    const s = JSON.parse(storage.getItem(STANDUP_KEY) ?? 'null') as Partial<StandupSettings> | null;
    const days = Array.isArray(s?.days) ? [...new Set(s.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    if (!s || !days.length || typeof s.at !== 'string' || !TIME.test(s.at) || typeof s.mates !== 'boolean') return DEFAULT_STANDUP;
    return { days, at: s.at, mates: s.mates };
  } catch { return DEFAULT_STANDUP; }
}

export function keepStandup(storage: Pick<Storage, 'setItem'>, s: StandupSettings): void {
  try { storage.setItem(STANDUP_KEY, JSON.stringify(s)); } catch { /* private mode: the defaults come back next time */ }
}

const midnight = (t: number) => new Date(t).setHours(0, 0, 0, 0);
const dayMove = (day: number, by: number) => { const d = new Date(day); d.setDate(d.getDate() + by); return d.setHours(0, 0, 0, 0); };

/** The moment a day's standup happens. */
export function standupAt(day: number, s: StandupSettings): number {
  const [h, m] = s.at.split(':').map(Number);
  return new Date(day).setHours(h, m, 0, 0);
}

/** The standup day before this one, a fortnight back at most. */
export function previousStandupDay(day: number, s: StandupSettings): number {
  let d = midnight(day);
  for (let i = 0; i < 14; i++) {
    d = dayMove(d, -1);
    if (s.days.includes(new Date(d).getDay())) return d;
  }
  return dayMove(midnight(day), -1);
}

/** What a day's standup covers: since the standup before it, up to its own, or up to now for today's. */
export function standupWindow(day: number, s: StandupSettings, now: number): { from: number; to: number } {
  const from = standupAt(previousStandupDay(day, s), s);
  return { from, to: midnight(day) === midnight(now) ? now : standupAt(day, s) };
}

export interface StandupDay { day: number; label: string; ahead: boolean }

/** The standup days of the week a day is in, Monday first. */
export function standupWeek(day: number, s: StandupSettings, now: number): StandupDay[] {
  const back = (new Date(day).getDay() + 6) % 7;
  const monday = dayMove(midnight(day), -back);
  const today = midnight(now);
  return Array.from({ length: 7 }, (_, i) => dayMove(monday, i))
    .filter((d) => s.days.includes(new Date(d).getDay()))
    .map((d) => ({ day: d, label: `${new Date(d).toLocaleDateString('en-US', { weekday: 'short' })} ${new Date(d).getDate()}`, ahead: d > today }));
}

/** The standup days before a day, newest first, for the feed under it. */
export function earlierStandupDays(day: number, s: StandupSettings, count: number): number[] {
  const out: number[] = [];
  let d = day;
  for (let i = 0; i < count; i++) { d = previousStandupDay(d, s); out.push(d); }
  return out;
}

export interface StandupNeed { line: TodayLine; on: string | null }

export interface StandupPost {
  key: string; name: string; kind: TodayPerson['kind'];
  shipped: TodayLine[]; finished: TodayLine[];
  /** Everything done since the standup before, newest first. */
  done: TodayLine[];
  working: TodayLine[];
  /** What is stuck, and on whom. */
  needs: StandupNeed[];
  privateDone: number;
  /** Private threads an agent is on: counted, never named. */
  privateWorking?: number;
}

const byNewest = (a: TodayLine, b: TodayLine) => b.at - a.at;
export const titleOf = (l: TodayLine) => l.title || (l.item ? shownTitle(l.item) : '');
const titled = (l: TodayLine): TodayLine => (l.title ? l : { ...l, title: titleOf(l) });

function postOf(p: TodayPerson): StandupPost {
  const g = groupsOf(p);
  return {
    key: p.key, name: p.name, kind: p.kind,
    shipped: [...p.shipped].sort(byNewest).map(titled),
    finished: [...p.finished, ...p.decided].sort(byNewest).map(titled),
    done: g.done.map(titled),
    working: g.working.map(titled),
    needs: g.blocked.map((l) => ({ line: titled(l), on: l.on ?? null })),
    privateDone: p.privateDone,
    privateWorking: p.privateWorking ?? 0,
  };
}

const says = (p: StandupPost) => p.done.length + p.working.length + p.needs.length + p.privateDone + (p.privateWorking ?? 0) > 0;

/** A post per teammate. With AI teammates off, each AI teammate's work joins yours. */
export function postsOf(people: readonly TodayPerson[], { mates }: { mates: boolean }): StandupPost[] {
  const posts = people.map(postOf);
  if (mates) return posts.filter(says);
  const mine = posts.find((p) => p.key === 'me') ?? { key: 'me', name: 'You', kind: 'me' as const, shipped: [], finished: [], done: [], working: [], needs: [], privateDone: 0 };
  for (const m of posts.filter((p) => p.kind === 'mate')) {
    mine.shipped = [...mine.shipped, ...m.shipped].sort(byNewest);
    mine.finished = [...mine.finished, ...m.finished].sort(byNewest);
    mine.done = [...mine.done, ...m.done].sort(byNewest);
    mine.working = [...mine.working, ...m.working].sort(byNewest);
    mine.needs = [...mine.needs, ...m.needs];
    mine.privateDone += m.privateDone;
    mine.privateWorking = (mine.privateWorking ?? 0) + (m.privateWorking ?? 0);
  }
  return [mine, ...posts.filter((p) => p.kind === 'person')].filter(says);
}

/** A run of words with tasks in it, each task drawn as a link. */
export type Part = string | TodayLine;

const named = (lines: readonly TodayLine[]): Part[] => {
  const shown = lines.slice(0, 2);
  const rest = lines.length - shown.length;
  if (shown.length === 1) return [shown[0]];
  if (!rest) return [shown[0], ' and ', shown[1]];
  return [shown[0], ', ', shown[1], ` and ${rest} more`];
};

/** The post's sentence: what shipped, what finished, what it is on. */
export function sentenceOf(p: StandupPost): Part[] {
  const out: Part[] = [];
  const say = (lead: string, lines: readonly TodayLine[]) => {
    if (!lines.length) return;
    out.push(out.length ? ` ${lead} ` : `${lead} `, ...named(lines), '.');
  };
  say('Shipped', p.shipped);
  say('Finished', p.finished);
  if (!p.shipped.length && !p.finished.length && p.privateDone) out.push(`Finished ${p.privateDone} private ${p.privateDone === 1 ? 'thread' : 'threads'}.`);
  const hidden = p.privateWorking ?? 0;
  if (!hidden) say('Working on', p.working);
  else {
    const privately = `${hidden} private ${hidden === 1 ? 'thread' : 'threads'}`;
    const shown = p.working.slice(0, 2);
    const rest = p.working.length - shown.length;
    out.push(out.length ? ' Working on ' : 'Working on ');
    shown.forEach((l, i) => { if (i) out.push(', '); out.push(l); });
    out.push(!shown.length ? privately : rest ? `, ${rest} more and ${privately}` : ` and ${privately}`, '.');
  }
  return out.length ? out : ['Nothing moved.'];
}

/** Whether a post has the words searched for, in a task or in who wrote it. */
export function postMatches(p: StandupPost, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.name, ...p.done.map(titleOf), ...p.working.map(titleOf), ...p.needs.map((n) => titleOf(n.line))].some((t) => t.toLowerCase().includes(q));
}
