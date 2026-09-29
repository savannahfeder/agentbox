// PURE. Task search: which rows a query keeps, what order they come in, and
// what each kept row says.
//
// The approved design: design B, entry point E1 (a magnifier
// in the corner), key `/`. The drawing is
// designs/2026-08-13-search-b-in-the-real-ui.html in the Agentbox docs.
//
// Three things that drawing settles, and they are still the frame of this file:
//
//   EVERY PROJECT AND EVERY TAB, CLOSED INCLUDED. In a store in real use the
//   great majority of tasks are closed, so a search that reads only the tab she
//   is standing on is a search that misses most of what she is looking for. Nothing
//   here takes a view or a product filter, on purpose: there is no argument
//   that could narrow it.
//
//   THE WHOLE TASK, NOT THE TITLE. Titles are labels; the sentence she
//   remembers is almost always in the body or in a result.
//
//   THE ROW SAYS WHY IT MATCHED. The summary under a hit is the sentence the
//   words were actually found in, not the row's usual summary. Without that, a
//   result list is a list of titles that look unrelated to the query.
//
// The match itself is carried in INK, never colour: the list spends exactly one
// colour and it is the rule under a selected title. So this file hands the row
// its text already split into matched and unmatched runs (`splitHits`), and the
// stylesheet makes the matched run full-strength inside a dimmed line. No new
// colour enters the list.
/* ------------------------------------------------------------------------ */
// WHAT CHANGED.
//
// Measured on a real store of several hundred tasks: "how to work" kept 316
// rows, and 4 of them contain that phrase. The words
// were looked for one at a time, anywhere, INSIDE other words, so "to" was
// found in "into", "customer" and "stopped"; and the survivors were then sorted
// by recency alone, which put the second row that actually says "how to work"
// at rank 10, under three hundred rows that do not say it.
//
// So two rules were added and one was left alone on purpose:
//
//   A WORD IS FOUND AT THE START OF A WORD. Prefixes stay in, because she is
//   typing and "conver" has to find "conversion" before she finishes it. What
//   goes is the middle of a word: "to" is in "today" and is not in "into". On
//   that store this alone took "how to work" from 316 rows to 189.
//
//   THE PHRASE OUTRANKS THE WORDS. Rows carrying the typed words together, in
//   the order they were typed, sort above rows that merely contain all of them,
//   and a hit in the title sorts above a hit in the prose.
//
// NOTHING IS DROPPED FOR RANKING LOW.A row that matched yesterday still
// matches; it is underneath, under its own label, not gone. The only rows this
// change removes from a list are the ones that never really matched, the
// "stopped" that answered "to".
/* ------------------------------------------------------------------------ */
// THE WHOLE CONVERSATION. This is the next one, and it was the
// biggest left.
//
// A task holds five pieces of writing: the title, the body, her reply, the
// agent's result and the agent's latest checkpoint. This file read three. The
// two it skipped are the two carrying the NEWEST words on the row: a checkpoint
// is what the reading pane leads with while a run is still going, and a reply
// is the only place the user's own words are ever written down.
//
// Measured on a real store: most rows carry a checkpoint and a reply, and
// most checkpoints and many replies hold five or more substantial words
// written nowhere else on the row. Taking a four word run out of the middle of
// a reply and searching for it found nothing on well over half of the rows
// that could be tested that way, and the same held for checkpoints.
//
// A hit in either sits on the same rungs as one in the prose, because to her
// they are the same task. The one visible difference is that a summary lifted
// out of her own reply says so: an unlabelled sentence under a row reads as
// something an agent wrote, and the pane already calls hers "You said".

import { searchText } from './format';
import { rowSummary, SUMMARY_BUDGET } from './list-rules';

export interface Searchable {
  id: string;
  title?: string;
  // The written name the list draws instead of the title. Searched alongside
  // it, never instead of it (haystack, below).
  label?: string;
  body?: string;
  result?: string;
  // The agent's latest checkpoint and her own reply. See THE WHOLE
  // CONVERSATION above: these are the two newest fields a row has, and search
  // used to read neither of them.
  note?: string;
  answer?: string;
  status?: string;
  updatedAt?: number;
}

// HOW WELL A ROW MATCHED IS THE ORDER AND NOTHING ELSE. This used to be a
// second output, a band, which the list printed as the headings "Best matches"
// and "Also mentions these words".So the ranking stayed and the labels went:
// the best answers are still first, the list just does not announce it.
export interface SearchHit<T> {
  item: T;
  // The sentence the query was found in, ready for the row's summary line.
  summary: string;
}

/* ------------------------------- the query ------------------------------- */
// A query is its words AND, separately, the whole thing as one phrase. Both are
// needed downstream: the words decide what is kept, the phrase decides what
// comes first and what gets lit as a single run.
export interface Query {
  terms: string[];
  // The typed words as one string, when there is more than one of them. Empty
  // for a single word, because a one-word phrase is just the word.
  phrase: string;
  // She wrapped it in double quotes, which means only the phrase will do.
  quoted: boolean;
}

// Everything that reads text here reads it folded, and folding is 1:1 ON
// PURPOSE: `splitHits` slices the ORIGINAL string at offsets found in the
// folded one, so a fold that changed the length would light the wrong letters.
// That rules out stripping accents by NFD, which is why it is not done. It
// costs little today: accented words are rare in task text. Curly quotes are
// common, and a straight apostrophe is what a keyboard types, so those are
// folded.
const FOLDED: Record<string, string> = {
  '‘': "'", '’': "'", 'ʼ': "'",
  '“': '"', '”': '"',
  '–': '-', '—': '-',
};

export function fold(text: string): string {
  return text.toLowerCase().replace(/[‘’ʼ“”–—]/g, (c) => FOLDED[c]);
}

// Whitespace-separated terms, ALL of which must appear. AND rather than OR
// because narrowing is the entire point of typing a second word: with OR,
// "conversion rate" would return strictly more rows than "conversion", which
// reads as the search being broken.
export function queryTerms(query: string): string[] {
  return parseQuery(query).terms;
}

export function parseQuery(query: string): Query {
  const folded = fold(query).trim();
  // "in quotes" means she wants that group of characters and nothing looser.
  const quoted = folded.length > 2 && folded.startsWith('"') && folded.endsWith('"');
  const inner = (quoted ? folded.slice(1, -1) : folded).trim();
  const terms = normalize(inner.replace(/"/g, ' ').split(/\s+/));
  const phrase = terms.length > 1 ? terms.join(' ') : '';
  return { terms, phrase, quoted: quoted && terms.length > 0 };
}

// Case is folded HERE and in every function that takes terms, rather than once
// at the door. Four functions in this file take a term list, they are called
// from three different places, and a caller that hands one of them a raw
// capital gets silence rather than an error: no match, no highlight, no way to
// tell that from a store with nothing in it.
function normalize(terms: string[]): string[] {
  return terms.map((t) => fold(t)).filter(Boolean);
}

/* ------------------------------- the match ------------------------------- */
// Everything the row is made of. Product name is deliberately NOT in here: a
// product's rows are already one keystroke away through the filter, and folding
// it in means typing "astral" returns three hundred rows whose titles have
// nothing to do with what was typed, which is the shape of a broken search.
//
// The title and the prose are kept apart because a hit in the title is worth
// more than a hit in paragraph nine, and joined for the phrase test.
//
// EVERY RUN OF WHITESPACE BECOMES ONE SPACE, and that is what makes a phrase
// findable at all. Her prose is markdown and markdown wraps: "the How to\nwork
// section" is one sentence to a reader and three words with a newline in the
// middle to `indexOf`, so a phrase test against the raw text misses exactly the
// rows a phrase search exists to find. Nothing is sliced out of this string, it
// is only ever asked yes or no, so collapsing it costs no offsets.
//
// `body` and `result` are the SAME strings in their original case, already cut
// into sentences, kept here so the summary line neither strips the markdown nor
// re-splits the prose on every keystroke. Measured over a store of several
// hundred rows: stripping and splitting on every keystroke was 22ms a letter, caching
// both is 4ms, and 16.7ms is one frame.
interface Hay { title: string; all: string; body: Line[]; result: Line[]; note: Line[]; answer: Line[] }

// One sentence, kept twice: as written, because that is what the row
// prints, and folded flat, because that is what the query is asked of. Both, so
// that neither the printing nor the asking has to redo the other's work.
interface Line { raw: string; folded: string }

function squash(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function splitLines(text: string): Line[] {
  return splitSentences(text).map((raw) => ({ raw, folded: squash(fold(raw)) }));
}

// Rebuilding this per keystroke was costing real time: typing "how to work"
// one letter at a time cost 245ms of search over several hundred rows,
// almost all of it `plainText` stripping the same markdown eleven times. The
// item objects do not change while she types, so they are the cache key, and a
// WeakMap means a row that leaves the store takes its haystack with it.
const HAY = new WeakMap<object, Hay>();

function haystack(i: Searchable): Hay {
  const cached = HAY.get(i as object);
  if (cached) return cached;
  // BOTH NAMES, BECAUSE A ROW NOW HAS TWO. The list draws the written label
  // (rowTitle, list-rules.ts) and the row keeps her own title underneath it, so
  // searching only one of them loses her a row whichever one she remembered.
  // The two are joined with a full stop for the same reason the prose below is:
  // no phrase may be found straddling the seam between them.
  const title = squash(fold([i.label, i.title].filter(Boolean).join(' . ')));
  const body = searchText(i.body);
  const result = searchText(i.result);
  const note = searchText(i.note);
  const answer = searchText(i.answer);
  // Joined with a full stop rather than a space so that no phrase can be found
  // straddling the seam between two fields: "the page" ending one and "is done"
  // opening the next is not a row that says "the page is done".
  const prose = [body, result, note, answer].filter(Boolean).join(' . ');
  const all = `${title} . ${squash(fold(prose))}`;
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

// A letter or a digit. Anything else ends a word, so a term is findable after a
// bracket, a slash, a dash or a quote: "(idle-time)" contains "time".
function isWordChar(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
}

// Where `needle` starts a word in `hay`, at or after `from`; -1 for nowhere.
// A PREFIX COUNTS, the middle of a word does not. This is the whole of the
// "into" fix, and the prefix half is what keeps search live while she is still
// typing the word she wants. Pass `whole` to require the far end of the word
// too, which is what every term except the one under her cursor gets.
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

// ONLY THE LAST WORD MAY BE HALF TYPED. She is typing left to right, so the
// word under her cursor is the only one that is plausibly unfinished, and every
// word before it she has already finished and moved past. Measured in the real
// app: letting all three of "how to work" match as prefixes lit the
// "to" inside "tonight" and inside "too", which is a quieter version of the
// original noise. Requiring the earlier words whole costs nothing she was
// using and takes that noise out.
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

/* ------------------------------ the ranking ------------------------------ */
// Four rungs, and the gap that matters to her is the one between 2 and 1: at 2
// and above the row SAYS what was typed, at 1 it merely contains the words.
//
//   4  the phrase, in the title
//   3  the phrase, in the body or the result
//   2  every word, all of them in the title
//   1  every word, somewhere
//   0  not a match
function score(i: Searchable, q: Query): number {
  if (q.terms.length === 0) return 0;
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

// The rung one row lands on for one query, which is the whole of what ranking
// means here and the only handle a test has on it. 0 is not a match at all.
// Nothing draws this: it decides the order and then it is gone.
export function searchScore(i: Searchable, query: string): number {
  return score(i, parseQuery(query));
}

/* ------------------------------ the results ------------------------------ */
// Best first, then newest. It used to be newest only, on the reasoning that the
// list groups by day and a relevance sort tears those groups into a repeating
// stack of the same three labels. The reasoning was sound and the conclusion
// was wrong: the tearing is real, so THE LIST STOPS GROUPING BY DAY while a
// query is up and prints no heading at all instead. Every row still prints its
// own timestamp on the right, so nothing about when it happened is lost.
//
// AN EMPTY QUERY IS EVERY TASK, NOT NO TASKS, and in her usual order. Opening
// search used to hand back nothing, so the list she was reading vanished and
// the screen read as an empty store until something was typed.
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

/* ------------------------- why this row matched -------------------------- */
// The sentence the words were found in. Read in the row's own order of
// importance: on anything finished the result is the news, so it is asked
// first, exactly as rowSummary does it. When the only hit is in the title the
// row keeps its ordinary summary, because the title is already on screen with
// the match lit up in it and repeating it underneath says nothing.
//
// The checkpoint and her reply are asked LAST, and in that order. The task is
// what the row is about, so a phrase written in both the ask and the progress
// note summarises off the ask; and between the two of them the checkpoint is
// the newer word, the one the pane itself would be showing her.
//
// AND NOTHING ON THIS LINE IS LABELLED, including the sentences out of her own
// reply. It carried a "You said: " prefix for one day. The line is the sentence
// that matched, whole, and the pane says the rest when she opens the row.
//
// AND THE PHRASE IS ASKED OF EVERY FIELD BEFORE ANY WORD IS ASKED OF ONE. This
// file has always said that is the rule; until 2026-08-28 it was applied inside
// a field and not across them, so one word early beat the whole phrase late.
export function hitSummary(i: Searchable, terms: string[], phrase = ''): string {
  const finished = i.status === 'done';
  const { body, result, note, answer } = haystack(i);
  const ordered = finished ? [result, body, note] : [body, result, note];
  // Two passes over the same fields: the phrase everywhere, then the words
  // everywhere. Her reply comes last in both.
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

// The first sentence containing the query, windowed so the match is visible.
// THE PHRASE IS ASKED FOR FIRST, across the whole text, before any single word
// is: for "how to work" the first sentence containing "to" is nearly always a
// sentence about something else, and a summary that answers her phrase with an
// unrelated line is the row failing to say why it is in the list.
//
// Clipping from the left (what the row does at rest) is wrong here: the
// sentence that matched is often two hundred characters long with the words at
// the end, and a summary that cuts them out is a row that cannot say why it is
// in the list.
export function matchedSentence(
  text: string,
  terms: string[],
  phrase = '',
  budget = SUMMARY_BUDGET,
): string {
  return text ? pickSentence(splitLines(text), terms, phrase, budget) : '';
}

// The same, over prose already cut into sentences, which is how the row asks it
// so that hundreds of bodies are not re-split on every keystroke.
//
// `phraseOnly` is how hitSummary walks every field looking for the phrase
// before it lets any field answer with a single word. On its own this function
// cannot know there is a better sentence two fields along.
function pickSentence(
  lines: Line[],
  terms: string[],
  phrase: string,
  budget: number,
  phraseOnly = false,
): string {
  // Before she types there is nothing to look for, and walking every sentence
  // of every row to find nothing is the whole cost of merely opening search.
  const wanted = normalize(terms);
  if (!phrase && wanted.length === 0) return '';
  if (phrase) {
    for (const line of lines) {
      // Asked of the FOLDED sentence so a wrapped phrase is still found, but
      // the WINDOW is placed off a single word, which cannot straddle a
      // newline and so cannot be at a shifted offset in the real string.
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

// THE LONGEST WORD DECIDES, not the leftmost. She types "how to work" and a
// sentence's leftmost hit is nearly always "to"; windowing there shows her a
// run-up to a two-letter word she did not mean. The longest term is the one
// carrying the meaning, so the window is built around that and the shorter
// words come along inside it.
// THE LONGEST WORD DECIDES WHERE THE WINDOW SITS, not the leftmost. She types
// "how to work" and a sentence's leftmost hit is nearly always "to"; windowing
// there shows her a run-up to a two-letter word she did not mean. So the terms
// are tried longest first, while each keeps the whole-word rule its POSITION in
// the query earns it.
function firstHit(line: Line, terms: string[]): number {
  const order = terms.map((t, i) => i).sort((a, b) => terms[b].length - terms[a].length);
  for (const i of order) {
    // The raw sentence and the folded one only differ where a newline was
    // squashed, and a single word never contains one, so the offset carries.
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

/* ----------------------------- the highlight ----------------------------- */
// Text split into runs, each marked hit or not, so the row can draw the match
// without anything downstream having to parse the query again. Returns a single
// unmarked run when nothing matches, which is what a title-only or body-only
// row needs on its other line.
export interface Run { text: string; hit: boolean }

export function splitHits(text: string, terms: string[], phrase = ''): Run[] {
  if (!text) return [];
  const wanted = normalize(terms);
  if (wanted.length === 0) return [{ text, hit: false }];
  const lower = fold(text);
  // Every word-start occurrence of every term AND of the phrase, then merged,
  // so "how to work" lights as one run rather than three words with two gaps,
  // and so overlapping terms ("con" and "conversion") light one run rather than
  // nesting two.
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
