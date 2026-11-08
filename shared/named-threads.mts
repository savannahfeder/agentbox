// PURE. The other threads a message names, summed up for the agent that reads
// it (w-c110f2371d). A message names one as `[Its name](w-…)` (# in a text
// box) or as a bare id; the store has no way to read one thread by id, so
// without this the agent holds a name and nothing behind it.
import { doneSteps, shownToPeople, visibilityOf, type CardItem, type ProjectSeen } from './thread-cards.mts';

type Row = CardItem & { product?: string };
type Seen = ProjectSeen;
type Reach = { rank: number; people: string[] };
export interface FoundThread { item: Row; product?: (NonNullable<Seen> & { name?: string }) | null }

const ID = /(?<![\w/.:@-])w-[a-f0-9]{10}(?![\w/-]|\.[a-z0-9])/gi;
const MOST = 5;
const ANSWER_CHARS = 1200;

/** Every thread the texts name, once each and in order, never the row itself. */
export function namedThreadIds(texts: unknown[], self?: string): string[] {
  const ids = texts.flatMap((t) => String(t ?? '').match(ID) ?? []).map((id) => id.toLowerCase());
  return [...new Set(ids)].filter((id) => id !== self);
}

// Who can read a thread: 0 only its owner, 1 chosen people, 2 the team.
const reach = (item: Row, product: Seen): Reach => {
  const v = visibilityOf(item, product);
  return v === 'private' ? { rank: 0, people: [] } : v === 'people' ? { rank: 1, people: shownToPeople(item, product) } : { rank: 2, people: [] };
};
// The agent's answer reaches everyone who reads the row, so a thread is
// quoted into it only when all of them could open that thread already.
const mayQuote = (named: Reach, row: Reach): boolean => named.rank > row.rank
  || (named.rank === row.rank && (named.rank !== 1 || row.people.every((p) => named.people.includes(p))));

const STATE: Record<string, string> = { open: 'open', claimed: 'running', blocked: 'blocked', done: 'done' };
const clip = (text: string, most: number): string => (text.length > most ? `${text.slice(0, most).replace(/\s+\S*$/, '')}…` : text);
const day = (ts: number | undefined): string | null => (ts ? new Date(ts).toISOString().slice(0, 16).replace('T', ' ') : null);

function summed(id: string, found: FoundThread | null | undefined, rowReach: Reach): string[] {
  if (!found?.item) return [`## ${id}`, '', 'Not on this computer, so there is nothing to read about it here.'];
  const { item, product } = found;
  if (!mayQuote(reach(item, product), rowReach)) {
    return [`## ${id}`, '', 'Fewer people can see that thread than can see this one, so it is not summed up here.'];
  }
  const name = (item.label ?? '').trim() || item.title || id;
  const moved = day(item.updatedAt);
  const lines = [`## ${name} (${id})`, '', [product?.name ?? item.product, STATE[item.status as string] ?? item.status, moved ? `last moved ${moved} UTC` : null].filter(Boolean).join(', ')];
  if (item.problem) lines.push('', `Context: ${item.problem}`);
  const steps = doneSteps(item.progress);
  if (steps.length) lines.push('', 'Done so far:', ...steps.map((s) => `- ${s}`));
  const answer = String(item.result ?? '').trim();
  if (answer) lines.push('', 'Its last answer:', '', clip(answer, ANSWER_CHARS));
  return lines;
}

/**
 * The brief's section on the threads a message names, or '' when it names
 * none. `find(id)` is the store's read of one thread, `{ item, product }`.
 */
export function namedThreadsBlock({ texts, row, product, find }: {
  texts: unknown[];
  row: Row;
  product: Seen;
  find: (id: string) => FoundThread | null | undefined;
}): string {
  const ids = namedThreadIds(texts, row?.id);
  if (!ids.length) return '';
  const rowReach = reach(row, product);
  const shown = ids.slice(0, MOST);
  const rest = ids.slice(MOST);
  const out = [
    '',
    '# The threads this message names',
    '',
    'The message links these threads by name. What each one is and where it stands is',
    'below, so you need not go looking for them.',
  ];
  for (const id of shown) {
    let found: FoundThread | null | undefined = null;
    try { found = find(id); } catch { found = null; }
    out.push('', ...summed(id, found, rowReach));
  }
  if (rest.length) out.push('', `…and ${rest.length} more not summed up here: ${rest.join(', ')}.`);
  return out.join('\n');
}
