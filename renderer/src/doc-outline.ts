// The outline of a document, read off the headings it draws.

export type Heading = { level: number; text: string };
/** `at` is the heading's place among those handed in, so a press finds its element. */
export type OutlineEntry = { at: number; depth: 0 | 1; text: string };

export function outlineOf(headings: Heading[]): OutlineEntry[] {
  const kept = headings
    .map((h, at) => ({ at, level: h.level, text: h.text.replace(/\s+/g, ' ').trim() }))
    // The first h1 is the title the page already shows.
    .filter((h, i, all) => h.text && h.level <= 3 && !(h.level === 1 && all.findIndex((x) => x.level === 1) === i));
  const levels = [...new Set(kept.map((h) => h.level))].sort();
  return kept.map((h) => ({ at: h.at, depth: h.level === levels[0] ? 0 : 1, text: h.text }));
}

export const outlineShows = (entries: OutlineEntry[]) => entries.length >= 3;

/** The last heading at or above the reading line, or -1 before the first. */
export function sectionAt(tops: number[], line: number): number {
  let on = -1;
  tops.forEach((top, i) => { if (top <= line) on = i; });
  return on;
}
