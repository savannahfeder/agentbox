// What ⌘K matches on.
//
// Here rather than in Palette.tsx because it was wrong in ways only a test
// catches, and a test cannot reach into a component's useMemo. The palette once
// filtered on the LABEL ALONE while its own comment claimed it filtered on the
// hint too, so every word written to be searchable was searched by nothing.
//
// THERE ARE NO APPEARANCE ROWS. The app has one look, Light (w-9e434e8671), so
// the theme picker, the light/dark toggle and the way off a picture all went.

/* ------------------------------- matching -------------------------------- */

// Keywords are the words she might TYPE, which are not always the words the row
// says. They are matched and never shown; the hint is shown and never matched.
// Keeping those two jobs in separate fields is the point: the hint is UI copy
// and has to read well, and a search that depends on copy reading a certain way
// breaks the next time someone improves the sentence.
export type Searchable = { label: string; keywords?: string };

// EVERY WORD OF THE QUERY MUST LAND, in any order, anywhere in the label or the
// keywords. She types "dark mode", which as one substring appears in no label in
// the app; as two words it finds the row that says "Switch to dark" and carries
// "mode" as a keyword. Substring-per-word, not whole-query-substring, and not
// fuzzy: a fuzzy match on a list this long puts rows she did not ask for under
// her return key, which is the bug palette-keys.ts was written for.
export function matchesQuery(query: string, row: Searchable): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${row.label} ${row.keywords ?? ''}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

// WHEN TWO ROWS ANSWER TO THE SAME LETTERS, THE ONE SHE MEANT GOES FIRST.
//
// Typing "rem" means Remind Me. It put Remote Control under her return key
// instead, because both labels start with those three letters and the palette
// showed them in the order the list was assembled in.
//
// No string rule separates those two. "rem" starts both labels, matches the
// same number of words in both, and Remind Me is the LONGER of the two, so
// every generic tiebreak there is hands the row to Remote Control. A tie like
// this is broken by naming the winner, and the winner is the command used
// daily rather than the one used occasionally.
//
// The rest of the list is left exactly as the palette assembled it. The sort is
// stable, so nothing else moves, and an empty query is not sorted at all: ⌘K
// with nothing typed opens on the same row it always did.
//
// One letter more still reaches Remote Control on its own, because "remo" is in
// neither "remind me (snooze)" nor its keywords. So this costs the other command
// a keystroke and nothing else.
const FIRST_AMONG_MATCHES = ['snooze'];

export function rankMatches<T extends { id: string }>(query: string, rows: T[]): T[] {
  if (!query.trim()) return rows;
  const rank = (row: T) => (FIRST_AMONG_MATCHES.includes(row.id) ? 0 : 1);
  return [...rows].sort((a, b) => rank(a) - rank(b));
}

/* ------------------------- when nothing comes back ------------------------ */

// Two ways out were considered, a placeholder like Superhuman's or nothing.
// Neither, quite: the app ALREADY says this sentence when
// task search comes back empty (App.tsx), so the palette says the same sentence
// in the same place a row would have been. That gives the divider something to
// divide, adds no word the app does not already use, and avoids a suggestion
// list like Superhuman's, which reads as noise. Collapsing the box to a
// bare input instead was the other candidate and was rejected on flow: it snaps
// the whole modal shut on the keystroke that stops matching, which is a louder
// event than the stray hairline this fixes.
//
// The query is echoed because it is the one thing this line can say that she
// does not already know: it shows exactly what was searched for, stray
// character and all.
//
// A pasted paragraph is clipped at a WORD, not mid-letter: cutting "over the
// lazy dog" to "over t…" reads as a rendering fault rather than as a quotation,
// and the whole string is sitting in the input one line above anyway.
const ECHO_MAX = 32;

export function emptyLine(query: string): string {
  const q = query.trim();
  let shown = q;
  if (q.length > ECHO_MAX) {
    const cut = q.slice(0, ECHO_MAX);
    const lastSpace = cut.lastIndexOf(' ');
    shown = `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  }
  return `Nothing matches “${shown}”.`;
}
