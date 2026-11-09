// PURE. How a typed query meets a piece of text, the one rule the thread
// search (renderer/src/search.ts) and the search over lines, files and
// comments (main/everything-found.mjs) share: every word must appear, each at
// the start of a word, and only the last may be a prefix, since it is the one
// still being typed.

// Folding must keep the length, because callers slice the original text at
// offsets found in the folded one. Curly quotes and dashes fold to what a
// keyboard types.
const FOLDED = { '‘': "'", '’': "'", 'ʼ': "'", '“': '"', '”': '"', '–': '-', '—': '-' };

export function fold(text) {
  return String(text ?? '').toLowerCase().replace(/[‘’ʼ“”–—]/g, (c) => FOLDED[c]);
}

/**
 * Unfolded text with its camelCase names also written split ("toKebab" adds
 * "to Kebab") and its hyphenated words joined ("sign-up" adds "signup"), for
 * haystacks that are matched and never sliced.
 */
export function withHumps(text) {
  const raw = String(text ?? '');
  const extra = [raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2'), raw.replace(/([A-Za-z0-9])-(?=[A-Za-z0-9])/g, '$1')].filter((t) => t !== raw);
  return [raw, ...extra].join(' . ');
}

export function isWordChar(c) {
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
}

/** Where `needle` starts a word in `hay`, at or after `from`, or -1. `whole` also wants the word to end there. */
export function wordStart(hay, needle, from = 0, whole = false) {
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
export function queryOf(query) {
  const folded = fold(query).trim();
  const quoted = folded.length > 2 && folded.startsWith('"') && folded.endsWith('"');
  const inner = (quoted ? folded.slice(1, -1) : folded).replace(/"/g, ' ').trim();
  const terms = inner.split(/\s+/).filter(Boolean);
  return { terms, phrase: terms.length > 1 ? terms.join(' ') : '', quoted: quoted && terms.length > 0 };
}

const termAt = (hay, terms, i, from = 0) => wordStart(hay, terms[i], from, i < terms.length - 1);

/** Whether folded text holds the whole query. */
export function holds(foldedText, q) {
  if (!q.terms.length) return false;
  if (q.quoted) return wordStart(foldedText.replace(/\s+/g, ' '), q.phrase) >= 0;
  return q.terms.every((_, i) => termAt(foldedText, q.terms, i) >= 0);
}

/** Where the longest typed word starts in folded text, or 0. */
export function firstHit(foldedText, q) {
  const order = q.terms.map((_, i) => i).sort((a, b) => q.terms[b].length - q.terms[a].length);
  for (const i of order) {
    const at = termAt(foldedText, q.terms, i);
    if (at >= 0) return at;
  }
  return 0;
}

/** At most `budget` characters of `text` with the match inside, cut on spaces and marked with an ellipsis on a cut side. */
export function windowAround(text, hit, budget) {
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
