// What ⌘K matches on, and the appearance rows it matches.
//
// Both halves are here rather than in Palette.tsx because both were wrong in
// ways only a test catches, and a test cannot reach into a component's useMemo.
//
// Two separate faults, and the second one is not what it looks like. The app
// knew perfectly well it was in dark mode; `lookMeans` has always turned a
// picture into `theme: 'dark'`. Typing "dark" found nothing because with a
// picture on, the two rows offered were "Turn off Lake" and "Switch to light",
// and neither of those strings contains the word "dark". The palette also
// filtered on the LABEL ALONE while its own comment claimed it filtered "on
// label and hint alike", so every hint written to be searchable — "theme · a
// background picture, in dark mode" — was searched by nothing. Typing "theme"
// matched no row in the app.
//
// So: ONE toggle row, found by "light" and by "dark" alike, whatever she is
// wearing, and it never lands on a picture.
//
// THE PICTURES THEMSELVES ARE NO LONGER ROWS HERE, AND THAT IS THE NEWER LAW.
// They used to be one row each, sixteen of them, findable by their own name.
//
// So the whole appearance section is four rows at most, and it is these: the
// picker, the light/dark toggle, the way off a picture, and match-my-system. A
// picture is chosen in the picker, where she can see it, and nowhere else in
// ⌘K. This overrules the earlier plan of keeping each picture findable by its
// own keyword: that list at full length was clutter, and the picker is the
// thing that replaced it.

import { type Look } from './skins';

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

/* ---------------------------- the appearance rows ------------------------ */

// A row as described, with the look it goes to instead of a callback, so this
// file stays pure and the component supplies the one thing it owns.
//
// `opens` is the one row that does not set a look: it raises the theme picker
// and lets her choose there. It says `opens` rather than carrying a callback so
// this file stays pure and a test can still see the whole appearance section.
// Before 2026-08-28 that row was assembled in Palette.tsx while the rest were
// assembled here, which meant no test could check what typing "theme" actually
// returns; that is the exact class of bug this file exists to catch.
export type LookRow = {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  to?: Look;
};

// THE TOGGLE IS ALWAYS ONE ROW AND ALWAYS SAYS WHERE IT LANDS. A picture is
// dark (skins.ts), so from a picture the toggle goes to light, and the label
// says light. That keeps the older law intact — every row says what it does,
// measured after "Switch to light" off a picture landed somewhere else — while
// giving the behaviour wanted: the same row answers to both words.
//
// It is deliberately NOT findable by "theme". Typing "theme" is how she reaches
// the pictures, and a toggle sitting above them under that word would be the
// row her return key hits.
const TOGGLE_KEYWORDS = 'light mode dark mode appearance colours colors';

// THREE ROWS, ONE PER CHOICE (w-9e434e8671): Light, Dark (which is Ember
// Grid) and Match system, the same three Settings' Themes page offers. The one
// already on says so in its hint. Every row answers to "theme", so typing it
// lists all three; "light", "dark" and "system" each find their own.
export function lookRows(look: Look): LookRow[] {
  const on = (id: Look) => (look === id ? 'on now' : 'theme');
  return [
    { id: 'theme-light', label: 'Theme: Light', hint: on('light'), keywords: `${TOGGLE_KEYWORDS} theme themes light`, to: 'light' },
    { id: 'theme-dark', label: 'Theme: Dark', hint: on('ember-grid'), keywords: `${TOGGLE_KEYWORDS} theme themes dark ember`, to: 'ember-grid' },
    { id: 'theme-match', label: 'Theme: Match system', hint: on('match'), keywords: 'theme themes match system mac automatic appearance', to: 'match' },
  ];
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
