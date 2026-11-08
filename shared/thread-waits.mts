// WHAT A PERSON SAYS A THREAD WAITS ON, kept in the row's `blockedBy`: another
// thread of theirs (its id), a teammate's thread (`card:<person>:<thread>`) or a
// person (`person:<id>`). While it waits the thread sits in Later. When what it
// waits on ends, the team sync clears the wait and writes `waitEnded`, which puts
// the thread back in its owner's Needs you saying so.
//
// An agent's wait on other people (`person:`, `card:`) is this too, since
// only the team sync can see those end. An agent's wait on threads is not: the
// supervisor resumes those (resumeFinishedWaits).

export interface WaitingItem {
  id: string;
  status?: string;
  blockedBy?: readonly string[];
  runner?: string | null;
  createdBy?: string | null;
  label?: string;
  title?: string;
  product?: string;
  updatedAt?: number;
  agent?: unknown;
  wrote?: Record<string, { ts?: number; source?: string } | undefined>;
}

export interface WaitCard {
  personId: string;
  threadId: string;
  title?: string | null;
  state?: string;
  visible?: boolean;
  updatedAt?: number;
}

export type WaitPart =
  | { kind: 'person'; person: string }
  | { kind: 'name'; name: string; person?: undefined }
  | { kind: 'card'; person: string; thread: string }
  | { kind: 'thread'; thread: string; person?: undefined };

type NameOf = (id: string) => string;

export const personWait = (id: string): string => `person:${id}`;
export const cardWait = (person: string, thread: string): string => `card:${person}:${thread}`;
// Someone off the team, or what it waits on, in plain words: a task's block only.
const NAME = 'name:';
const NAME_CHARS = 64 - NAME.length;
export function nameWait(words: string | null | undefined): string | null {
  const said = String(words ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_CHARS).trim();
  return said ? `${NAME}${said}` : null;
}

export function waitParts(id: string): WaitPart {
  if (id.startsWith('person:')) return { kind: 'person', person: id.slice('person:'.length) };
  if (id.startsWith(NAME)) return { kind: 'name', name: id.slice(NAME.length) };
  if (id.startsWith('card:')) {
    const [, person, thread] = id.split(':');
    return { kind: 'card', person, thread };
  }
  return { kind: 'thread', thread: id };
}

// Waiting on the row's own owner is a question for them, not a wait. And a
// reply after the agent wrote it is answered by the agent's next words, which
// must reach them.
function onOthers(item: Omit<WaitingItem, 'id'>): boolean {
  const reply = item.wrote?.answer;
  if (reply?.source === 'founder' && (reply.ts ?? 0) > (item.wrote?.blockedBy?.ts ?? 0)) return false;
  return item.blockedBy!.every((id) => {
    const w = waitParts(String(id));
    return w.kind !== 'thread' && w.person !== (item.runner ?? item.createdBy ?? null);
  });
}

export function setByPerson(item: Omit<WaitingItem, 'id'> | null | undefined): boolean {
  if (item?.status === 'done' || !Array.isArray(item?.blockedBy) || !item.blockedBy.length) return false;
  return item.wrote?.blockedBy?.source === 'founder' || onOthers(item);
}

// Nothing waits for ever: a wait with no end comes back and says so.
export const WAIT_GIVES_UP_MS = 3 * 86_400_000;
const FIRST = (name: string | null | undefined) => String(name ?? '').trim().split(/\s+/)[0] || 'Someone';
const named = (item: { label?: string; title?: string } | null | undefined) => item?.label || item?.title || 'a thread';

export interface WaitEndContext {
  items: readonly WaitingItem[];
  cards: readonly WaitCard[];
  lastWordFrom: (person: string) => number;
  nameOf: NameOf;
  now: number;
}

function oneEnd(id: string, since: number, { items, cards, lastWordFrom, nameOf }: WaitEndContext): string | null {
  const w = waitParts(id);
  if (w.kind === 'person') return lastWordFrom(w.person) > since ? `${FIRST(nameOf(w.person))} wrote to you` : null;
  if (w.kind === 'name') return null;
  if (w.kind === 'card') {
    const card = cards.find((c) => c.personId === w.person && c.threadId === w.thread);
    return card?.state === 'done' ? `${FIRST(nameOf(w.person))} finished “${card.title ?? 'their thread'}”` : null;
  }
  const row = items.find((i) => i.id === w.thread);
  if (!row) return 'The thread this waited on is gone';
  return row.status === 'done' ? `“${named(row)}” finished` : null;
}

function waitingOnWords(id: string, { items, nameOf }: Pick<WaitEndContext, 'items' | 'nameOf'>): string {
  const w = waitParts(id);
  if (w.kind === 'thread') return `“${named(items.find((i) => i.id === w.thread))}”`;
  if (w.kind === 'name') return w.name;
  return FIRST(nameOf(w.person));
}

/** The threads whose waits have ended, each with the words that say how. */
export function endedWaits<T extends WaitingItem>(rows: readonly T[], ctx: WaitEndContext): { item: T; said: string }[] {
  const out: { item: T; said: string }[] = [];
  for (const item of rows) {
    if (!setByPerson(item)) continue;
    // setByPerson holds only for a row whose wait the fold recorded.
    const since = item.wrote!.blockedBy!.ts ?? 0;
    if (ctx.now - since >= WAIT_GIVES_UP_MS) {
      out.push({ item, said: `Still waiting on ${waitingOnWords(item.blockedBy![0], ctx)} after 3 days` });
      continue;
    }
    const ends = item.blockedBy!.map((id) => oneEnd(id, since, ctx));
    if (ends.every(Boolean)) out.push({ item, said: ends.at(-1)! });
  }
  return out;
}

/** The status column's words for a thread that waits, and the whole of it for the hover. */
export function waitWords(
  item: WaitingItem | null | undefined,
  { items = [], cards = [], nameOf }: { items?: readonly WaitingItem[]; cards?: readonly WaitCard[]; nameOf: NameOf },
): { word: string; title: string } | null {
  if (!setByPerson(item)) return null;
  const w = waitParts(item!.blockedBy![0]);
  if (w.kind === 'person') { const name = FIRST(nameOf(w.person)); return { word: `Waits on ${name}`, title: `Waits on ${name}` }; }
  if (w.kind === 'name') return { word: `Waits on ${w.name}`, title: `Waits on ${w.name}` };
  if (w.kind === 'card') {
    const name = FIRST(nameOf(w.person));
    const title = cards.find((c) => c.personId === w.person && c.threadId === w.thread)?.title;
    return { word: `Waits on ${name}`, title: title ? `Waits on ${name}’s “${title}”` : `Waits on ${name}` };
  }
  return { word: 'Waits on a thread', title: `Waits on “${named(items.find((i) => i.id === w.thread))}”` };
}

const CHOICES = 8;

/** What a thread can wait on: people, then open threads, newest first. */
export function waitChoices({ item, me, people, items, cards, nameOf }: {
  item: WaitingItem;
  me: string | null;
  people: readonly { id: string; name?: string | null }[];
  items: readonly WaitingItem[];
  cards: readonly WaitCard[];
  nameOf: NameOf;
}): { id: string; label: string }[] {
  const humans = people.filter((p) => p.id !== me).map((p) => ({ id: personWait(p.id), label: FIRST(p.name) }));
  const mine = items.filter((i) => i.product === item.product && i.id !== item.id && i.status !== 'done' && !i.agent)
    .map((i) => ({ id: i.id, label: named(i), at: i.updatedAt ?? 0 }));
  const theirs = cards.filter((c) => c.personId !== me && c.visible && c.state !== 'done' && c.title)
    .map((c) => ({ id: cardWait(c.personId, c.threadId), label: `${FIRST(nameOf(c.personId))}: ${c.title}`, at: c.updatedAt ?? 0 }));
  return [...humans, ...[...mine, ...theirs].sort((a, b) => b.at - a.at).slice(0, CHOICES).map(({ id, label }) => ({ id, label }))];
}
