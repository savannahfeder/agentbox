// FIND A THREAD FROM A DESCRIPTION: a small model reads a list of your threads
// and names the ones a sentence describes.
//
// The words search needs the words; a person often remembers only what a
// thread was about ("the one where the agent's browser kept stealing focus").
// They asked for this and said they would wait up to ten seconds for it.
import { fold, termStart } from './word-match.mts';

export interface FindCandidate {
  /** `product/id`, handed back unchanged. */
  key: string;
  /** Excluded from the prompt when its project is tied to one account (main/ipc.mts). */
  product: string;
  title: string;
  /** What the thread is about: its Context, or the start of its first message. */
  about: string;
  /** The tab it is on, in the tab's word. */
  where: string;
  /** Its last real activity, ms. */
  at: number;
  project: string;
}

export interface FindPick { key: string; why: string }

/**
 * How many threads the model reads: about 70 tokens each, a quick read for a
 * small model, and the prompt travels as one argument, which Linux caps at 128 KB.
 */
export const FIND_MOST = 200;
export const FIND_PICKS = 5;
/**
 * The whole wait, over every account tried. Answers take 4 to 6 s; a busy Mac
 * pushed one past the ten seconds they said they would wait.
 */
export const FIND_BUDGET_MS = 15_000;

const SMALL_WORDS = new Set('a an and the of to in on for with that this it its is was were be by at from about my me i we our you your one thread threads which where when what who how there their them they some any had has have did do does not but or as so if'.split(' '));

/** The words of a description worth looking for. */
export function describedWords(description: string): string[] {
  return [...new Set(fold(description).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !SMALL_WORDS.has(w)))];
}

/**
 * The threads the model is shown: those that share the most words with the
 * description, then the most recently active, `most` at most. A thread with no
 * shared word is still shown when there is room, because the description may
 * use none of its words.
 */
export function candidatesFor(all: readonly FindCandidate[], description: string, most = FIND_MOST): FindCandidate[] {
  const words = describedWords(description);
  const shared = (c: FindCandidate) => {
    const hay = fold(`${c.title} ${c.about}`);
    return words.filter((w) => termStart(hay, w) >= 0).length;
  };
  return all
    .map((c) => ({ c, n: shared(c) }))
    .sort((a, b) => b.n - a.n || b.c.at - a.c.at)
    .slice(0, most)
    .map(({ c }) => c);
}

const oneLine = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);

/** What a thread is about, and the start of its answer, which is often what a person remembers. */
export function aboutThread({ problem, body, result }: { problem?: string | null; body?: string | null; result?: string | null }): string {
  const asked = oneLine(problem?.trim() || body || '', 160);
  const answer = oneLine(result ?? '', 140);
  return answer ? `${asked} Answer: ${answer}` : asked;
}

function when(at: number, now: number): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return new Date(at).toISOString().slice(0, 10);
}

export function describePrompt(description: string, shown: readonly FindCandidate[], now = Date.now()): string {
  return [
    `Today is ${new Date(now).toISOString().slice(0, 10)}. Someone is looking for one of their work threads and described it like this:`,
    '',
    oneLine(description, 400),
    '',
    'Here are their threads, one per line: number, where it is, when it last moved, project, title, and what it is about.',
    '',
    ...shown.map((c, i) => `${i + 1}. [${c.where}, ${when(c.at, now)}, ${oneLine(c.project, 40)}] ${oneLine(c.title, 90)} :: ${oneLine(c.about, 320)}`),
    '',
    `Reply with the threads that best fit the description, best first, at most ${FIND_PICKS}, one per line, as`,
    'NUMBER | why it fits, in under ten plain words',
    'Only list threads that really fit. If none do, reply with the word none.',
  ].join('\n');
}

/** The picks in a reply, in its order, each a thread that was shown and listed once. */
export function readPicks(reply: string, shown: readonly FindCandidate[]): FindPick[] {
  const picks: FindPick[] = [];
  const seen = new Set<number>();
  for (const line of reply.split('\n')) {
    const m = line.match(/^\s*(?:[-*]\s*)?#?(\d{1,4})[.)]?\s*(?:[|:\-\u2013\u2014]\s*(.*))?$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > shown.length || seen.has(n)) continue;
    seen.add(n);
    picks.push({ key: shown[n - 1].key, why: oneLine(m[2] ?? '', 90).replace(/[.。]+$/, '') });
    if (picks.length === FIND_PICKS) break;
  }
  return picks;
}

export type FindAnswer = { ok: true; picks: FindPick[]; read: number } | { ok: false; error: string };

/**
 * Ask once and read the answer. `ask` resolves to '' for every failure (the
 * small-model contract in main/row-label.mts), which is said as one.
 */
export async function findByDescription({ description, candidates, ask, now = Date.now() }: {
  description: string;
  candidates: readonly FindCandidate[];
  ask: (prompt: string) => Promise<string>;
  now?: number;
}): Promise<FindAnswer> {
  const shown = candidatesFor(candidates, description);
  if (!description.trim()) return { ok: false, error: 'Describe the thread first.' };
  if (!shown.length) return { ok: true, picks: [], read: 0 };
  const reply = await ask(describePrompt(description, shown, now)).catch(() => '');
  if (!reply.trim()) return { ok: false, error: 'No agent answered in time.' };
  return { ok: true, picks: readPicks(reply, shown), read: shown.length };
}
