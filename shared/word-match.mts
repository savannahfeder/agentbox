// PURE. How a typed query meets a piece of text, the one rule the thread
// search (renderer/src/search.ts) and the search over lines, files and
// comments (main/everything-found.mts) share: every word must appear, each at
// the start of a word, and only the last may be a prefix, since it is the one
// still being typed. A word with an ending also finds its other forms
// (`stemOf`).

// Folding must keep the length, because callers slice the original text at
// offsets found in the folded one. Curly quotes and dashes fold to what a
// keyboard types.
const FOLDED: Record<string, string> = { '‘': "'", '’': "'", 'ʼ': "'", '“': '"', '”': '"', '–': '-', '—': '-' };

export interface WordQuery {
  terms: string[];
  phrase: string;
  quoted: boolean;
}

export function fold(text: unknown): string {
  return String(text ?? '').toLowerCase().replace(/[‘’ʼ“”–—]/g, (c) => FOLDED[c]);
}

/**
 * Unfolded text with its camelCase names also written split ("toKebab" adds
 * "to Kebab") and its hyphenated words joined ("sign-up" adds "signup"), for
 * haystacks that are matched and never sliced.
 */
export function withHumps(text: unknown): string {
  const raw = String(text ?? '');
  const extra = [raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2'), raw.replace(/([A-Za-z0-9])-(?=[A-Za-z0-9])/g, '$1')].filter((t) => t !== raw);
  return [raw, ...extra].join(' . ');
}

export function isWordChar(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
}

/** Where `needle` starts a word in `hay`, at or after `from`, or -1. `whole` also wants the word to end there. */
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

/** The typed words: all must appear. A query in double quotes must appear as that phrase. */
export function queryOf(query: string): WordQuery {
  const folded = fold(query).trim();
  const quoted = folded.length > 2 && folded.startsWith('"') && folded.endsWith('"');
  const inner = (quoted ? folded.slice(1, -1) : folded).replace(/"/g, ' ').trim();
  const terms = inner.split(/\s+/).filter(Boolean);
  return { terms, phrase: terms.length > 1 ? terms.join(' ') : '', quoted: quoted && terms.length > 0 };
}

/**
 * The front of a typed word that its other forms share: "opening" is "open",
 * "threads" is "thread". Null when nothing is cut, and never under four
 * letters, so "notes" stays "note" and does not find "nothing".
 */
export function stemOf(term: string): string | null {
  if (term.length < 5) return null;
  for (const end of ['ing', 'ies', 'es', 'ed', 's']) {
    if (!term.endsWith(end) || (end === 's' && term.endsWith('ss'))) continue;
    const stem = term.slice(0, -end.length);
    if (stem.length >= 4) return stem;
  }
  return null;
}

/** Where a typed word starts a word in `hay`: itself, or any word that starts with its stem. */
export function termStart(hay: string, term: string, from = 0, whole = false): number {
  const stem = stemOf(term);
  return stem ? wordStart(hay, stem, from, false) : wordStart(hay, term, from, whole);
}

/** Where a hit that starts at `at` ends: the typed word, or the rest of the word its stem found. */
export function termEnd(hay: string, term: string, at: number): number {
  if (!stemOf(term)) return at + term.length;
  let end = at;
  while (end < hay.length && isWordChar(hay[end])) end++;
  return end;
}

const termAt = (hay: string, terms: string[], i: number, from = 0): number => termStart(hay, terms[i], from, i < terms.length - 1);

/** Whether folded text holds the whole query. */
export function holds(foldedText: string, q: WordQuery): boolean {
  if (!q.terms.length) return false;
  if (q.quoted) return wordStart(foldedText.replace(/\s+/g, ' '), q.phrase) >= 0;
  return q.terms.every((_, i) => termAt(foldedText, q.terms, i) >= 0);
}

/** Where the longest typed word starts in folded text, or 0. */
export function firstHit(foldedText: string, q: WordQuery): number {
  const order = q.terms.map((_, i) => i).sort((a, b) => q.terms[b].length - q.terms[a].length);
  for (const i of order) {
    const at = termAt(foldedText, q.terms, i);
    if (at >= 0) return at;
  }
  return 0;
}

/** At most `budget` characters of `text` with the match inside, cut on spaces and marked with an ellipsis on a cut side. */
export function windowAround(text: unknown, hit: number, budget: number): string {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= budget) return flat;
  let start = Math.max(0, hit - 24);
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    start = space >= 0 && space < hit ? space + 1 : start;
  }
  let end = Math.min(flat.length, start + budget);
  if (end < flat.length) {
    const space = flat.lastIndexOf(' ', end);
    if (space > hit) end = space;
  }
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}
