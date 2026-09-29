// PURE. What ⌘F counts as a match, and how the matches are walked.
//
// w-cc5bc203d0. Command-F did nothing inside an agent chat, so there was no way
// to find something already sent. Nothing in the app answered the key at all,
// on any screen.
//
// WHY THE APP FINDS ITS OWN WORDS rather than handing the job to Chromium's
// `findInPage`. That call searches the whole page, and the whole page includes
// the box she is typing into, so "ship" is always found once in the box and
// the count is one too many; it also moves the keyboard off the box onto the
// match, so the second letter she types goes nowhere. Electron apps get round
// both with a second window laid over the first. Walking the text ourselves
// and painting it with the CSS highlight API does neither, and every rule about
// what a match IS lives in this one file where it can be tested.

/** A piece of text on the screen, and which paragraph it belongs to. */
export interface TextRun {
  text: string;
  // Runs with the same block are one line of reading ("ship **it** now" is
  // three runs); a different block is a different paragraph or message, and a
  // match must never run from one into the next.
  block: unknown;
}

export interface RunMatch {
  startRun: number;
  startOffset: number;
  endRun: number;
  endOffset: number;
}

// The quotes the agents write, against the plain ones on her keyboard.
const SINGLE = "['‘’]";
const DOUBLE = '["“”]';

function patternFor(query: string): RegExp | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  let source = '';
  for (const part of trimmed.split(/(\s+)/)) {
    if (!part) continue;
    // Any run of spaces she types finds any run of spaces on the page. The
    // screen draws a line break or a double space in a message as one space,
    // so one space is what she sees and what she types.
    if (/^\s+$/.test(part)) { source += '\\s+'; continue; }
    for (const ch of part) {
      if (ch === "'" || ch === '‘' || ch === '’') source += SINGLE;
      else if (ch === '"' || ch === '“' || ch === '”') source += DOUBLE;
      else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(source, 'gi');
}

/** Every [start, end) of `query` in `text`, never overlapping. */
export function findMatches(text: string, query: string): Array<[number, number]> {
  const pattern = patternFor(query);
  if (!pattern) return [];
  const found: Array<[number, number]> = [];
  for (const m of text.matchAll(pattern)) {
    if (m[0].length === 0) continue;
    found.push([m.index!, m.index! + m[0].length]);
  }
  return found;
}

// What goes between two paragraphs when they are laid end to end. A query
// comes from a one-line box, so it can never contain this and a match can
// never cross it; and it is not whitespace, so "done next" cannot bridge the
// end of one message and the start of the next either.
const BETWEEN_BLOCKS = '\u0000';

/**
 * Matches over the pieces of text the screen is built from, each reported as
 * where it starts and ends in those pieces, so the caller can make a Range.
 */
export function matchesAcrossRuns(runs: TextRun[], query: string): RunMatch[] {
  let joined = '';
  // starts[i] is where run i begins in `joined`.
  const starts: number[] = [];
  runs.forEach((run, i) => {
    if (i > 0 && run.block !== runs[i - 1].block) joined += BETWEEN_BLOCKS;
    starts.push(joined.length);
    joined += run.text;
  });
  // The run a position falls in. An end position that lands exactly on a
  // boundary belongs to the run it closes, not the next one.
  const runAt = (pos: number, isEnd: boolean) => {
    let lo = 0;
    let hi = runs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const beginsAfter = isEnd ? starts[mid] >= pos : starts[mid] > pos;
      if (beginsAfter) hi = mid - 1;
      else lo = mid;
    }
    return lo;
  };
  return findMatches(joined, query).map(([s, e]) => {
    const startRun = runAt(s, false);
    const endRun = runAt(e, true);
    return { startRun, startOffset: s - starts[startRun], endRun, endOffset: e - starts[endRun] };
  });
}

/** The next match along, wrapping at both ends. -1 when there are none. */
export function stepIndex(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}

/** What the box says beside the words: "3 of 12", or that there are none. */
export function countLabel(current: number, count: number, query: string): string {
  if (!query.trim()) return '';
  if (count === 0) return 'No matches';
  return `${Math.max(0, current) + 1} of ${count}`;
}
