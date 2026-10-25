// PURE. Naming another thread while you write (w-c110f2371d).
//
// @ is for who: people, and the agents a conversation brings in. # is for
// what, as on GitHub and in Slack, so typing # offers your threads. A pick sits
// in the box as "#Its name" and is sent as `[Its name](w-…)`: the agent reads
// the name and the id, and the thread view draws the link as that thread.
import { rowTitle } from './list-rules';
import { ticketReference } from './ticket-references';

export interface ThreadLike {
  id: string;
  product?: string;
  productName?: string;
  title?: string;
  label?: string;
  status?: string;
  updatedAt?: number;
  wrote?: Parameters<typeof rowTitle>[0]['wrote'];
}
export interface ThreadMention { start: number; end: number; id: string; name: string }

const NAME_BUDGET = 60;
const ROWS = 6;

/** The name a thread goes by in the box: the list's own, cut at a word. */
export function threadName(item: ThreadLike): string {
  const name = rowTitle(item).replace(/\s+/g, ' ').trim();
  if (name.length <= NAME_BUDGET) return name;
  const space = name.slice(0, NAME_BUDGET + 1).lastIndexOf(' ');
  return `${name.slice(0, space > 20 ? space : NAME_BUDGET).replace(/[\s.,;:!?-]+$/, '')}…`;
}

/**
 * What the list is filtering on when the caret sits after a # and some words.
 * The # starts a word, so "issue#12" never opens it, and it is followed by
 * something other than a space or another #, so a markdown heading never does.
 */
export function threadQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|[\s(])#((?:[^\s#[\]()][^\n#]{0,59})?)$/.exec(text.slice(0, caret));
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const linkable = (t: ThreadLike) => ticketReference(t.id) === t.id;

/** The threads offered for what was typed: every word starts a word of the thread's name or title, newest first. */
export function threadRows<T extends ThreadLike>(threads: readonly T[], query: string, { here }: { here?: string } = {}): T[] {
  const q = query.trim().toLowerCase();
  const asked = words(q);
  const fits = (t: T) => {
    if (/^w-[a-f0-9]+$/.test(q)) return t.id.startsWith(q);
    if (!asked.length) return !q;
    const have = [...words(threadName(t)), ...words(t.title ?? '')];
    return asked.every((w) => have.some((h) => h.startsWith(w)));
  };
  return threads
    .filter((t) => t.id !== here && linkable(t) && !!threadName(t) && fits(t))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, ROWS);
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Every thread named in the text, as "#" and its name. Found again from the
 * words alone, so a draft reopened tomorrow still knows what it names. The
 * longest name that fits wins; between two threads of one name, the one picked
 * here, then the newer.
 */
export function findThreadMentions(text: string, threads: readonly ThreadLike[], picked: readonly string[] = []): ThreadMention[] {
  const out: ThreadMention[] = [];
  if (!text.includes('#')) return out;
  const named = threads.filter(linkable).map((t) => ({ t, name: threadName(t) })).filter((n) => n.name)
    .sort((a, b) => b.name.length - a.name.length
      || picked.lastIndexOf(b.t.id) - picked.lastIndexOf(a.t.id)
      || (b.t.updatedAt ?? 0) - (a.t.updatedAt ?? 0));
  for (let i = text.indexOf('#'); i >= 0; i = text.indexOf('#', i + 1)) {
    if (i > 0 && !/[\s(]/.test(text[i - 1])) continue;
    const hit = named.find(({ name }) => text.startsWith(name, i + 1) && !WORD_CHAR.test(text[i + 1 + name.length] ?? ''));
    if (!hit) continue;
    out.push({ start: i, end: i + 1 + hit.name.length, id: hit.t.id, name: hit.name });
    i += hit.name.length;
  }
  return out;
}

const replaceEach = (text: string, mentions: readonly ThreadMention[], as: (m: ThreadMention) => string) =>
  mentions.slice().sort((a, b) => b.start - a.start)
    .reduce((out, m) => out.slice(0, m.start) + as(m) + out.slice(m.end), text);

/** The text as it is sent: every mention a link to its thread. */
export function encodeThreadMentions(text: string, mentions: readonly ThreadMention[]): string {
  return replaceEach(text, mentions, (m) => `[${m.name.replace(/([[\]\\])/g, '\\$1')}](${m.id})`);
}

/** The text with each mention reduced to its name, for a title. */
export function withThreadNames(text: string, mentions: readonly ThreadMention[]): string {
  return replaceEach(text, mentions, (m) => m.name);
}
