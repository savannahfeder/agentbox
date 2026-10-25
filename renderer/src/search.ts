// Pure task search: which rows a query keeps, their order, and what each kept
// row says.
//
// It reads every project and every tab, closed included, because most tasks in
// a store in use are closed. Nothing here takes a view or a product filter. It
// reads the whole task: label, title, body, result, latest checkpoint and the
// user's reply. A kept row's summary is the sentence the words were found in.
//
// The match is shown in ink, not colour, because the list's one colour is the
// rule under a selected title. `splitHits` hands the row matched and unmatched
// runs, and the stylesheet dims the unmatched ones.
//
// A term matches at the start of a word, not inside one: "to" finds "today"
// but not "into". The phrase outranks the loose words, and a title hit
// outranks a prose hit. Nothing is dropped for ranking low.

import { searchText } from './format';
import { rowSummary, SUMMARY_BUDGET } from './list-rules';
import { ticketQuery } from './ticket-references';

export interface Searchable {
  id: string;
  title?: string;
  // The written name the list draws instead of the title. Searched as well as
  // the title, never instead of it.
  label?: string;
  body?: string;
  result?: string;
  // The agent's latest checkpoint and the user's own reply.
  note?: string;
  answer?: string;
  status?: string;
  updatedAt?: number;
}

// How well a row matched sets only the order. The list prints no headings for
// it (tests/a-result-list-has-no-headings.test.mjs).
export interface SearchHit<T> {
  item: T;
  // The sentence the query was found in, ready for the row's summary line.
  summary: string;
}

// The words decide what is kept. The phrase decides what comes first and what
// lights as one run.
export interface Query {
  terms: string[];
  // The typed words as one string when there are several, empty for one word.
  phrase: string;
  // The query was wrapped in double quotes, so only the phrase will do.
  quoted: boolean;
}

// Folding must keep the length, because `splitHits` slices the original string
// at offsets found in the folded one. That rules out stripping accents by NFD.
// Curly quotes and dashes fold to what a keyboard types.
const FOLDED: Record<string, string> = {
  '‘': "'", '’': "'", 'ʼ': "'",
  '“': '"', '”': '"',
  '–': '-', '—': '-',
};

export function fold(text: string): string {
  return text.toLowerCase().replace(/[‘’ʼ“”–—]/g, (c) => FOLDED[c]);
}

// Whitespace-separated terms, all of which must appear, because a second word
// is typed to narrow the list.
export function queryTerms(query: string): string[] {
  return parseQuery(query).terms;
}

export function parseQuery(query: string): Query {
  const folded = fold(query).trim();
  const quoted = folded.length > 2 && folded.startsWith('"') && folded.endsWith('"');
  const inner = (quoted ? folded.slice(1, -1) : folded).trim();
  const terms = normalize((ticketQuery(inner) ?? inner).replace(/"/g, ' ').split(/\s+/));
  const phrase = terms.length > 1 ? terms.join(' ') : '';
  return { terms, phrase, quoted: quoted && terms.length > 0 };
}

// Every function that takes terms folds them itself, because a raw capital
// from a caller gives no match and no error.
function normalize(terms: string[]): string[] {
  return terms.map((t) => fold(t)).filter(Boolean);
}

// What a row is searched over. The product name is left out: a product's rows
// are one keystroke away through the filter, and including it makes a product
// name match every row of that product.
//
// The title is kept apart because a title hit ranks higher. In `all`, every
// run of whitespace becomes one space so a phrase is found across a markdown
// line wrap; `all` is only tested, never sliced, so that costs no offsets. The
// sentence lists are cached so the summary does not strip markdown and
// re-split prose on every keystroke.
interface Hay { title: string; all: string; body: Line[]; result: Line[]; note: Line[]; answer: Line[] }

// One sentence as written, for printing, and folded flat, for matching.
interface Line { raw: string; folded: string }

function squash(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function splitLines(text: string): Line[] {
  return splitSentences(text).map((raw) => ({ raw, folded: squash(fold(raw)) }));
}

// Keyed by the item object, which does not change while the user types. A
// WeakMap lets a row that leaves the store take its haystack with it.
const HAY = new WeakMap<object, Hay>();

function haystack(i: Searchable): Hay {
  const cached = HAY.get(i as object);
  if (cached) return cached;
  // The list draws the label (rowTitle, list-rules.ts) with the title under it,
  // so both are searched.
  const title = squash(fold([i.label, i.title].filter(Boolean).join(' . ')));
  const body = searchText(i.body);
  const result = searchText(i.result);
  const note = searchText(i.note);
  const answer = searchText(i.answer);
  // Fields, and the label and title above, are joined with ' . ' so no phrase
  // is found straddling the seam between two of them.
  const prose = [body, result, note, answer].filter(Boolean).join(' . ');
  const all = `${fold(i.id)} . ${title} . ${squash(fold(prose))}`;
  const hay: Hay = {
    title,
    all,
    body: splitLines(body),
    result: splitLines(result),
    note: splitLines(note),
    answer: splitLines(answer),
  };
  HAY.set(i as object, hay);
  return hay;
}

// Anything but a letter or a digit ends a word, so "(idle-time)" contains
// "time".
function isWordChar(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
}

// Where `needle` starts a word in `hay`, at or after `from`, or -1. A prefix
// counts and the middle of a word does not. `whole` also requires the word to
// end there.
export function wordStart(hay: string, needle: string, from = 0, whole = false): number {
  if (!needle) return -1;
  let at = hay.indexOf(needle, from);
  while (at >= 0) {
    const startsWord = at === 0 || !isWordChar(hay[at - 1]);
    const endsWord = !whole || !isWordChar(hay[at + needle.length] ?? '');
    if (startsWord && endsWord) return at;
    at = hay.indexOf(needle, at + 1);
  }
  return -1;
}

// Only the last term may be a prefix, since it is the one still being typed.
// Earlier terms must be whole words, so "to" in "how to work" does not light
// "tonight".
function termAt(hay: string, terms: string[], i: number, from = 0): number {
  return wordStart(hay, terms[i], from, i < terms.length - 1);
}

function hasEvery(hay: string, terms: string[]): boolean {
  return terms.every((_, i) => termAt(hay, terms, i) >= 0);
}

export function matches(i: Searchable, terms: string[]): boolean {
  const wanted = normalize(terms);
  if (wanted.length === 0) return false;
  return hasEvery(haystack(i).all, wanted);
}

// Higher sorts first. At 2 and above the row says what was typed; at 1 it only
// contains the words.
//
//   6  the ticket id, exactly
//   5  a ticket id that starts with the query
//   4  the phrase, in the title
//   3  the phrase, anywhere else
//   2  every word, all of them in the title
//   1  every word, somewhere
//   0  not a match
function score(i: Searchable, q: Query): number {
  if (q.terms.length === 0) return 0;
  const idQuery = q.terms.length === 1 ? ticketQuery(q.terms[0]) : null;
  if (idQuery && fold(i.id).startsWith(idQuery)) return fold(i.id) === idQuery ? 6 : 5;
  const hay = haystack(i);
  if (q.phrase) {
    if (wordStart(hay.title, q.phrase) >= 0) return 4;
    if (wordStart(hay.all, q.phrase) >= 0) return 3;
    if (q.quoted) return 0;              // the query asked for the phrase and only that
  }
  if (hasEvery(hay.title, q.terms)) return 2;
  if (hasEvery(hay.all, q.terms)) return 1;
  return 0;
}

// The rung one row lands on for one query, exported for tests. 0 is not a
// match.
export function searchScore(i: Searchable, query: string): number {
  return score(i, parseQuery(query));
}

// Best first, then newest. The list stops grouping by day while a query is up,
// because a relevance sort would tear the day groups apart; each row still
// shows its own time. An empty query returns every task, newest first.
export function searchItems<T extends Searchable>(items: T[], query: string): Array<SearchHit<T>> {
  const q = parseQuery(query);
  if (q.terms.length === 0) {
    return [...items]
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .map((item) => ({ item, summary: hitSummary(item, []) }));
  }
  return items
    .map((item) => ({ item, n: score(item, q) }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || (b.item.updatedAt ?? 0) - (a.item.updatedAt ?? 0))
    .map(({ item }) => ({ item, summary: hitSummary(item, q.terms, q.phrase) }));
}

// The sentence the words were found in. On a finished row the result is asked
// first, as rowSummary does. The checkpoint comes after body and result, and
// the user's reply last. The phrase is asked of every field before any single
// word is asked of one. A title-only hit keeps the ordinary summary, since the
// title already shows the match. The line carries no label.
export function hitSummary(i: Searchable, terms: string[], phrase = ''): string {
  const idQuery = terms.length === 1 ? ticketQuery(terms[0]) : null;
  if (idQuery && fold(i.id).startsWith(idQuery)) return i.id;
  const finished = i.status === 'done';
  const { body, result, note, answer } = haystack(i);
  const ordered = finished ? [result, body, note] : [body, result, note];
  for (const only of phrase ? ['phrase', 'words'] : ['words']) {
    const wantPhrase = only === 'phrase';
    for (const sentences of ordered) {
      const sentence = pickSentence(sentences, terms, phrase, SUMMARY_BUDGET, wantPhrase);
      if (sentence) return sentence;
    }
    const mine = pickSentence(answer, terms, phrase, SUMMARY_BUDGET, wantPhrase);
    if (mine) return mine;
  }
  return rowSummary(i, finished ? 'done' : 'inbox');
}

// The first sentence with the phrase, else the first with a word, windowed
// around the match rather than clipped from the left, so the match still shows
// when it sits at the end of a long sentence.
export function matchedSentence(
  text: string,
  terms: string[],
  phrase = '',
  budget = SUMMARY_BUDGET,
): string {
  return text ? pickSentence(splitLines(text), terms, phrase, budget) : '';
}

// The same, over sentences already split. `phraseOnly` lets hitSummary look
// for the phrase in every field before any field answers with a single word.
function pickSentence(
  lines: Line[],
  terms: string[],
  phrase: string,
  budget: number,
  phraseOnly = false,
): string {
  // With nothing typed, skip walking every sentence of every row.
  const wanted = normalize(terms);
  if (!phrase && wanted.length === 0) return '';
  if (phrase) {
    for (const line of lines) {
      // Matched on the folded sentence so a wrapped phrase is found. The
      // window is placed from a single word, whose offset carries to the raw
      // string.
      if (wordStart(line.folded, phrase) < 0) continue;
      return windowAround(line.raw, Math.max(0, firstHit(line, wanted)), budget);
    }
  }
  if (phraseOnly) return '';
  for (const line of lines) {
    const hit = firstHit(line, wanted);
    if (hit >= 0) return windowAround(line.raw, hit, budget);
  }
  return '';
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

// The longest term places the window, not the leftmost, which is usually a
// short word like "to". Each term keeps the whole-word rule its position in
// the query gives it.
function firstHit(line: Line, terms: string[]): number {
  const order = terms.map((t, i) => i).sort((a, b) => terms[b].length - terms[a].length);
  for (const i of order) {
    // Folded offsets match the raw sentence only up to the first run of two
    // or more whitespace characters, which `squash` shortens.
    const at = termAt(line.folded, terms, i);
    if (at >= 0) return at;
  }
  return -1;
}

// A budget-sized window with the match inside it, cut on word boundaries and
// marked with an ellipsis on whichever side was cut.
function windowAround(sentence: string, hit: number, budget: number): string {
  if (sentence.length <= budget) return sentence;
  const lead = 24; // enough of a run-up that the match reads in context
  let start = Math.max(0, hit - lead);
  if (start > 0) {
    const space = sentence.indexOf(' ', start);
    start = space >= 0 && space < hit ? space + 1 : start;
  }
  let end = Math.min(sentence.length, start + budget);
  if (end < sentence.length) {
    const space = sentence.lastIndexOf(' ', end);
    if (space > hit) end = space;
  }
  return `${start > 0 ? '…' : ''}${sentence.slice(start, end).trim()}${end < sentence.length ? '…' : ''}`;
}

// Text split into runs, each marked hit or not, so the row can draw the match
// without parsing the query again. Nothing matching gives one unmarked run.
export interface Run { text: string; hit: boolean }

export function splitHits(text: string, terms: string[], phrase = ''): Run[] {
  if (!text) return [];
  const wanted = normalize(terms);
  if (wanted.length === 0) return [{ text, hit: false }];
  const lower = fold(text);
  // Spans for every term and for the phrase, merged so "how to work" lights as
  // one run and overlapping terms do not nest.
  const spans: Array<[number, number]> = [];
  const push = (needle: string, find: (from: number) => number) => {
    let at = find(0);
    while (at >= 0) {
      spans.push([at, at + needle.length]);
      at = find(at + 1);
    }
  };
  wanted.forEach((t, i) => push(t, (from) => termAt(lower, wanted, i, from)));
  if (phrase) push(phrase, (from) => wordStart(lower, phrase, from));
  if (spans.length === 0) return [{ text, hit: false }];
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const runs: Run[] = [];
  let at = 0;
  for (const [s, e] of merged) {
    if (s > at) runs.push({ text: text.slice(at, s), hit: false });
    runs.push({ text: text.slice(s, e), hit: true });
    at = e;
  }
  if (at < text.length) runs.push({ text: text.slice(at), hit: false });
  return runs;
}
