// PURE. One list of the threads a query finds, whether the words are in the
// title, the summary or somewhere in what was said, each thread once, and the
// line each one shows under its title.
//
// The order:
//   1. The words in the title, by how closely (the ladder in ../search.ts),
//      then the thread most recently active.
//   2. Everything else, the typed phrase first, then by how much of the thread
//      is about the words, then most recently active.
import type { FoundThread, ThreadStateWord, WorkItem } from '../types';
import { lastChange } from '../byline';
import { stateWord } from '../threads-made';

export interface ThreadHit { item: WorkItem; summary: string; rung: number }

export interface RankedThread {
  item: WorkItem;
  /** The line under the title: what the thread is about, or where the words were said. */
  line: string;
  /** Found in a message rather than the title: the message to land on. */
  said: FoundThread | null;
  inTitle: boolean;
}

// Rungs 2, 4, 5 and 6 have every word in the title or the ticket id.
const IN_TITLE = new Set([2, 4, 5, 6]);

/** 1 mention, a few, or many: a bigger count only counts once it is a different amount. */
const howMuch = (n: number) => (n >= 5 ? 2 : n >= 2 ? 1 : 0);

/** The project most found threads are in; a row elsewhere names its project. */
export function mostCommon(slugs: readonly string[]): string | undefined {
  const count = new Map<string, number>();
  for (const s of slugs) count.set(s, (count.get(s) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Where a found thread is: its tab, or Done for a closed one on none (another project's, or one just closed). */
export const whereWord = (tab: ThreadStateWord | null | undefined, item: Pick<WorkItem, 'status'>) => stateWord(tab ?? (item.status === 'done' ? 'done' : null));

const keyOf = (product: string | null | undefined, id: string | null | undefined) => `${product}/${id}`;

export function rankFoundThreads({ hits, said = [], items }: { hits: readonly ThreadHit[]; said?: readonly FoundThread[]; items: readonly WorkItem[] }): RankedThread[] {
  const byKey = new Map(items.map((i) => [keyOf(i.product, i.id), i]));
  const saidBy = new Map<string, FoundThread>();
  for (const s of said) if (s.kind !== 'shared') saidBy.set(keyOf(s.product, s.id), s);

  const rows = new Map<string, { item: WorkItem; rung: number; summary: string; said: FoundThread | null }>();
  for (const h of hits) rows.set(keyOf(h.item.product, h.item.id), { item: h.item, rung: h.rung, summary: h.summary, said: saidBy.get(keyOf(h.item.product, h.item.id)) ?? null });
  for (const [key, s] of saidBy) {
    if (rows.has(key)) continue;
    const item = byKey.get(key);
    if (item) rows.set(key, { item, rung: 0, summary: '', said: s });
  }

  const ranked = [...rows.values()].map((r) => {
    const inTitle = IN_TITLE.has(r.rung);
    const phrase = r.rung === 3 || !!r.said?.phrase;
    const mentions = (r.rung > 0 ? 1 : 0) + (r.said?.hits ?? 0);
    // A title already shows the match, so its line says what the thread is about.
    const fromSaid = !inTitle && !(r.rung > 0 && r.summary) && !!r.said;
    const line = inTitle ? (r.item.problem?.trim() || r.summary) : fromSaid ? r.said!.text : r.summary;
    return { item: r.item, rung: r.rung, inTitle, phrase, mentions, line, said: fromSaid ? r.said : null, at: lastChange(r.item) };
  });
  ranked.sort((a, b) => Number(b.inTitle) - Number(a.inTitle)
    || (a.inTitle ? b.rung - a.rung : Number(b.phrase) - Number(a.phrase) || howMuch(b.mentions) - howMuch(a.mentions))
    || b.at - a.at);
  return ranked.map(({ item, line, said: s, inTitle }) => ({ item, line, said: s, inTitle }));
}
