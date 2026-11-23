// What a thread's messages called a file: the short line a message put beside
// it ("Before:", "Option 2: faces only"), so the big view can show it.
import type { ThreadLine } from './artifact-marks.mts';
import { isHandBack } from './thread-asks.mts';

const EXT = 'png|jpe?g|gif|webp|svg|mp4|mov|m4v|webm|pdf|md|markdown|pptx|html?|csv|tsv';
const PATHISH = String.raw`(?:\.?\/)?[\w.~-]+(?:\/[\w.~-]+)*\.(?:${EXT})`;
// A link or picture, with its words; a quoted name; a bare path.
const MENTION = new RegExp(
  String.raw`(!?)\[([^\]]*)\]\(<?([^()\s>]+)>?\)`
  + '|`(' + PATHISH + ')`'
  + String.raw`|(?<![\w./:@~(\[-])(${PATHISH})(?![\w/-])`,
  'gi',
);
const FILE_NAME = new RegExp(String.raw`^[\w.~-]+\.(?:${EXT})$`, 'i');
const FENCE = /```[\s\S]*?(?:```|$)/g;
// Longer than this is a sentence about the work, not a name for one picture.
const MOST = 120;

const samePath = (a: string, b: string): boolean => {
  const x = a.replace(/^\.\//, '');
  const y = b.replace(/^\.\//, '');
  return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`);
};

/** `prose`: a name was taken out of a sentence, from its middle or after its end. */
interface Read { paths: string[]; words: string; prose: boolean }

const MARKS = /[\s*_`"'“”‘’()]+/g;
const holeAt = (line: string, from: number, to: number): boolean => {
  const before = line.slice(0, from).replace(MARKS, ' ').trim();
  const after = line.slice(to).replace(MARKS, ' ').trim();
  return /[.!?]$/.test(before) || (/\p{L}/u.test(before) && /^[\p{L}\p{N}.,;!?]/u.test(after));
};

/** One line: the files it names, and its words with those names taken out (a link's own words kept, unless they are a file name). */
function readLine(line: string): Read {
  const paths: string[] = [];
  let prose = false;
  const words = line.replace(MENTION, (_m, _bang: string, said: string | undefined, link: string | undefined, quoted: string | undefined, bare: string | undefined, at: number) => {
    const path = link ?? quoted ?? bare ?? '';
    const isFile = new RegExp(String.raw`\.(?:${EXT})$`, 'i').test(path.split(/[?#]/)[0]);
    if (isFile) paths.push(path);
    const gone = said !== undefined ? FILE_NAME.test(said.trim()) || (!said.trim() && isFile) : isFile;
    if (gone && holeAt(line, at, at + _m.length)) prose = true;
    if (said !== undefined) return gone ? '' : said;
    return isFile ? '' : _m;
  });
  return { paths, words: tidy(words), prose };
}

function tidy(words: string): string {
  return words
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)*/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|\s)[*_](\S)/g, '$1$2').replace(/(\S)[*_](?=\s|$|[.,:;])/g, '$1')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:\u2014\u2013-]+|[\s:\u2014\u2013-]+$/g, '');
}

const isLabel = (words: string): boolean => words.length <= MOST && (words.match(/\p{L}/gu) ?? []).length >= 2;

/** The label one message gives the file at `paths`, or null. */
function labelIn(text: string, paths: readonly string[]): string | null {
  const rows = text.replace(FENCE, (f) => '\n'.repeat((f.match(/\n/g) ?? []).length)).split('\n').map(readLine);
  const ours = rows.findIndex((r) => r.paths.some((p) => paths.some((q) => samePath(p, q))));
  if (ours < 0) return null;
  const own = rows[ours].words;
  // Words on a line that names another file too are a sentence about both, with a hole where each name was.
  const another = rows[ours].paths.some((p) => !paths.some((q) => samePath(p, q)));
  if (own) return isLabel(own) && !another && !rows[ours].prose ? own : null;
  // The nearest line of words above or below a line that only names files, never past another file.
  const near = (i: number, by: 1 | -1): string | null => {
    let j = i + by;
    while (rows[j] && !rows[j].words && !rows[j].paths.length) j += by;
    const r = rows[j];
    return r && !r.paths.length && isLabel(r.words) ? r.words : null;
  };
  // Whether this message puts each picture's words over it or under it, by what most of its
  // pictures have. Words right against a picture say so more surely than words a blank line away.
  const pictures = rows.flatMap((r, i) => (r.paths.length && !r.words ? [i] : []));
  const weigh = (by: 1 | -1) => pictures.reduce((n, i) => n + (near(i, by) ? (rows[i + by]?.words ? 2 : 1) : 0), 0);
  const over = weigh(-1);
  const under = weigh(1);
  return under > over ? near(ours, 1) ?? near(ours, -1) : near(ours, -1) ?? near(ours, 1);
}

/**
 * What the thread's messages called the file at any of `paths`, from the first
 * agent message that gives it a label, then anyone's. Null when none does.
 */
export function labelSaidFor(lines: readonly (ThreadLine | null | undefined)[] | null | undefined, paths: readonly (string | null | undefined)[]): string | null {
  const wanted = paths.filter((p): p is string => !!p);
  if (!wanted.length) return null;
  const all = (lines ?? []).filter((l): l is ThreadLine => !!l?.patch);
  for (const l of [...all.filter((x) => x.source === 'agent'), ...all.filter((x) => x.source !== 'agent')]) {
    for (const field of ['result', 'answer', 'note', 'body'] as const) {
      const text = l.patch?.[field];
      // A hand-back names the files it approved; that is a verdict, not what anyone called them.
      if (typeof text !== 'string' || (field === 'answer' && isHandBack(text))) continue;
      const found = labelIn(text, wanted);
      if (found) return found;
    }
  }
  return null;
}
