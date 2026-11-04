// THE ONE RULE FOR A THREAD'S TITLE: a few words naming the thing being worked
// on, never the sentence that opened it. The namer (main/row-label.mts) writes
// such a name with a model; this is what every title falls back to before it
// has one, on a copy that cannot ask a model, and on a teammate's copy that
// received a raw first sentence.

export const TITLE_WORDS = 6;
// A first clause this short is the name, whole.
const CLAUSE_WORDS = 7;
// A cut never keeps more than this.
const MOST_WORDS = 8;

// Opening words that are manners or a request, not the work.
const GREETING = /^(?:(?:hey|hi|hello|ok|okay|so|right)\b[^,.!?]{0,24}[,!]\s*)+/i;
const ASK = /^(?:(?:can|could|would|will) (?:you|we|someone)(?: please)?|please|pls|i (?:need|want|would like) (?:you )?to|we (?:need|have) to|i'd like (?:you )?to|let's|lets|go ahead and|help me)\s+/i;
const CANNOT = /^(?:i|we|they|it)(?: still)? (?:can't|cannot|can no longer|couldn't|am unable to|are unable to|is unable to)\s+/i;
const LOOK = /^(?:look (?:at|into)|find out|figure out|check|see)\s+(?=(?:why|how|what|whether|if)\b)/i;

// Words a title never ends on: a name stops before them, not on them.
const TAIL = new Set(`a an the of to for at on in into with by from and or but nor so as than that which who
  is are was were be been being am do does did has have had
  i we you he she they it its my our your their his her this these those there here when while because since if`.split(/\s+/));

// Where a whole clause ends: the name ends there. Otherwise it keeps its six words.
const BREAK = new Set(`and but because since which that when while if so`.split(/\s+/));
const bare = (w) => w.toLowerCase().replace(/[^a-z']/g, '');

// A phrase starts at these, so a cut just before one leaves the phrase before it whole.
const CUT_BEFORE = new Set(`at on in into onto for with without by from about after before until during over under
  off across between per via as to and or but so because since which that when while if where whether unless though although`.split(/\s+/));

// Only for a title the six words cut short: a clause these open cannot be
// finished, and a last word of these only leads to the words that were cut.
const OPENS = new Set(`whether if that because before after until unless when while where why how what which who`.split(/\s+/));
const LEADS = new Set(`whether before after until unless about off out up over going getting got get gets say says said
  think thinks ask asks asked tell tells told want wants need needs make makes made going trying try tries`.split(/\s+/));
const SUBJECT = new Set(`i we you he she they it`.split(/\s+/));
// "say they got X" reports X: the reporting words go and X stays.
const REPORTED = /\b(?:say|says|said|report|reports|reported|tell us|told us|mention|mentions|mentioned)\s+(?:that\s+)?(?:they|he|she|we)\s+/i;

const words = (s) => s.split(/\s+/).filter(Boolean);

function plain(text) {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:>\s?)+/, '').replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, '').replace(/^#+\s+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g, (_, a, b, c) => a ?? b ?? c)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Dr. Ames" and "e.g. Lisbon" do not end a sentence.
const ABBREVIATION = /(?:^|\s)(?:dr|mr|mrs|ms|st|jr|sr|vs|etc|inc|ltd|no|e\.g|i\.e|[a-z])$/i;

/** The first sentence: up to a . ! or ? that a space and a capital, or the end, follow. */
function firstSentenceOf(t) {
  const re = /[.!?]+(?=\s+["“'(\[]?[A-Z0-9]|\s*$)/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    if (m[0] === '.' && ABBREVIATION.test(t.slice(0, m.index))) continue;
    return t.slice(0, m.index + m[0].length);
  }
  return t;
}

/**
 * A short line someone typed, kept exactly as they wrote it: six words, or a
 * name of up to eight with no punctuation at all ("Make tasks from findings 1
 * to 3"), which cutting would break mid-phrase.
 */
// What the app writes into a message for a file. In backticks it is someone's words.
const PICTURE_LINK = /(?<!`)!\[([^\]\n]*)\]\([^)\n]*\)(?!`)/;
const FILE_LINK = /(?<![!`])\[([^\]\n]*)\]\((?:\.\/)?(?:attachments|phone-files)\/[^)\n]*\)(?!`)/g;

/** A message's words for a line that cannot draw: no pictures, and a file down to its name. */
export function withoutFiles(text) {
  const said = String(text ?? '');
  const out = said.replace(new RegExp(PICTURE_LINK.source, 'g'), '').replace(FILE_LINK, '$1');
  return out === said ? said : out.trim();
}

function alreadyShort(raw) {
  const t = String(raw ?? '').trim();
  if (!t || t.includes('\n') || /^>/.test(t)) return false;
  const n = words(t).length;
  return (n <= TITLE_WORDS && firstSentenceOf(t) === t) || (n <= 8 && !/[,;:.!?…]/.test(t));
}

/** Where a clause too long to keep whole is cut: the longest that fits six words, else the shortest up to eight. */
function naturalCut(w) {
  const at = w.map((x, k) => (k >= 3 && k <= MOST_WORDS && CUT_BEFORE.has(bare(x)) ? k : -1)).filter((k) => k > 0);
  const short = at.filter((k) => k <= TITLE_WORDS);
  return short.length ? short[short.length - 1] : at[0] ?? -1;
}

/**
 * PURE. A title of a few words from whatever a thread was opened with. A
 * short line comes back as typed, less a closing full stop; a sentence comes
 * back as its first clause if that is short, or else cut where a phrase ends,
 * with no greeting, no "can you", no quote mark and no trailing punctuation.
 */
export function shortTitle(opening) {
  const text = withoutFiles(opening).trim() || PICTURE_LINK.exec(String(opening ?? ''))?.[1] || opening;
  if (alreadyShort(text)) return String(text).trim().replace(/(?<!\.)\.$/, '');
  let t = plain(text);
  if (!t) return '';
  t = t.replace(GREETING, '').replace(ASK, '').replace(LOOK, '').replace(CANNOT, 'Cannot ');
  // The first sentence, then its first clause.
  t = firstSentenceOf(t);
  t = t.split(/\s*(?:[,;:(]|\s[-–—]\s|—)\s*/)[0] || t;
  t = t.replace(REPORTED, '');
  let w = words(t);
  const cut = w.findIndex((x, k) => k >= 3 && BREAK.has(bare(x)));
  const clause = cut < 0 ? w.length : cut;
  const keep = clause <= CLAUSE_WORDS ? clause : naturalCut(w.slice(0, clause));
  w = w.slice(0, keep > 0 ? keep : Math.min(TITLE_WORDS, clause));
  if (w.length < clause) {
    const opens = w.findIndex((x, k) => k >= 2 && OPENS.has(bare(x)));
    if (opens > 0) w = w.slice(0, opens);
    for (;;) {
      const last = bare(w[w.length - 1] ?? '');
      if (w.length > 2 && SUBJECT.has(bare(w[w.length - 2]))) w = w.slice(0, -2);
      else if (w.length > 2 && (LEADS.has(last) || TAIL.has(last))) w = w.slice(0, -1);
      else break;
    }
  }
  while (w.length > 1 && TAIL.has(bare(w[w.length - 1]))) w = w.slice(0, -1);
  const out = w.join(' ').replace(/[\s.,;:!?…'"“”‘’)\]-]+$/, '');
  return out ? out[0].toUpperCase() + out.slice(1) : '';
}

/**
 * PURE. What a thread is called on every screen and on the card a teammate
 * reads: the namer's label, unless the person renamed it after, in which case
 * theirs; and either one held to the rule.
 */
export function shownTitle(i) {
  const title = String(i?.title ?? '');
  const label = String(i?.label ?? '').trim();
  if (!label) return shortTitle(title);
  const theirs = i?.wrote?.title;
  const ours = i?.wrote?.label;
  const renamed = !!theirs && !!ours && theirs.source === 'founder' && theirs.ts > ours.ts;
  if (renamed && title.trim()) return shortTitle(title);
  // A name the person typed (Rename) is theirs to the letter; only the app's is cut.
  return ours?.source === 'founder' ? label : shortTitle(label);
}
