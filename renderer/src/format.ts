import { ruleLabel, type RepeatShape as RepeatRuleValue } from '../../shared/repeats.mjs';
import { readMoment } from './when-words';
// Time and grouping, Superhuman-style: terse, scannable, never a full date
// where "3m" will do.

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// THE PANEL CLOCK, AND IT ONLY EVER MOVES ON THE MINUTE. Under a minute this
// says "now" and then stops, which is the whole of what a quiet row needs to
// say. The second half is the value of `now` the rail is handed, quantised to
// the minute in App.tsx, so the text cannot change between minute boundaries
// however often React draws it.
export function agoQuiet(ts: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - ts) / 60_000));
  if (m < 1) return 'now';
  return ago(ts, now);
}

export function stamp(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const days = Math.floor((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}

export function dayLabel(ts: number, now = Date.now()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === -1) return 'Tomorrow';
  if (days < 0) return new Date(ts).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return `Last 7 days`;
  return 'Earlier';
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Options parsing: the worker brief asks for a "## Options" section with a
// numbered list, "(recommended)" marking the default. Parsing is tolerant; a
// body without options simply renders as prose.
export interface ParsedOption {
  n: number;
  text: string;
  recommended: boolean;
}

export function parseOptions(body?: string): ParsedOption[] {
  if (!body) return [];
  const lines = body.split('\n');
  let inOptions = false;
  const options: ParsedOption[] = [];
  for (const line of lines) {
    if (/^#{1,4}\s/.test(line)) {
      inOptions = /option/i.test(line);
      continue;
    }
    if (!inOptions) continue;
    const m = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (m) {
      options.push({
        n: Number(m[1]),
        text: m[2].trim(),
        recommended: /\(recommended\)/i.test(m[2]),
      });
    }
  }
  return options;
}

// WHICH FIELD A PICK LIVES IN, and it is not always the body.
//
// It was the body alone for as long as this existed, and that quietly closed
// the offer on most rows. The store folds patches per field with the
// user outranking an agent, so on a task the USER composed the body is the one
// field a worker cannot write. The moment a pick is worth the most is exactly
// there: a run finishes on the user's own directive and the honest next word is
// "merge it" or "leave it", and the worker has nowhere to put that.
//
// Measured on a real store: about half of recent results were on rows the
// user wrote, almost no row could draw the strip at all, and no result ever
// written carried an offer, because writing one there did nothing.
//
// So the offer comes off whatever the pane is actually leading with: the
// result, else the checkpoint, else the ask. The fallback to the body is what
// keeps this additive, so no row that already offered a pick loses one.
//
// WHEN BOTH THE RESULT AND THE CHECKPOINT OFFER, THE NEWER ONE WINS
// (w-1df18b337a). The result used to win whatever its age, so a checkpoint
// offering the next round sat under the last round's options.
export type OptionsField = 'result' | 'note' | 'body';

interface HasFields {
  result?: string; note?: string; body?: string;
  wrote?: Record<string, { ts: number } | undefined>;
}

const writtenAt = (item: HasFields, field: OptionsField) => item.wrote?.[field]?.ts ?? 0;

export function optionsFrom(item: HasFields): OptionsField {
  const inResult = parseOptions(item.result).length > 0;
  const inNote = parseOptions(item.note).length > 0;
  if (inResult && inNote) return writtenAt(item, 'note') > writtenAt(item, 'result') ? 'note' : 'result';
  if (inResult) return 'result';
  if (inNote) return 'note';
  return 'body';
}

export function itemOptions(item: HasFields): ParsedOption[] {
  return parseOptions(item[optionsFrom(item)]);
}

// AND WHETHER THE OFFER IS STILL LIVE, which is not the same as whether she has
// ever replied on this row.
//
// The picker used to hide the moment `answer` held anything at all, and that
// field is never cleared: a reply from Tuesday is still sitting on the row on
// Friday. So on every thread the user had ever spoken in, a worker's next offer
// was suppressed by the user's own last reply. Measured on a real store: most
// recently finished rows already carried an answer, and in nearly all of those
// the result was written AFTER the answer, so those offers would have been
// fresh.
//
// So the test is the one the inbox list already makes about news (rowSummary):
// which text is NEWER. An offer written after her last word is a live offer. An
// offer she has already answered is spent, and stays hidden, which is the case
// this rule was built for and still covers.
//
// AN AGENT'S NEWER WORD SPENDS AN OFFER TOO (w-1df18b337a). The thread said
// "Shipped to main as e4707e4." in a checkpoint and still drew the options of
// the run before it, "let it go, or change the chip first?", so she picked
// "ship it" and was told it had already shipped. A message written after the
// offer that offers nothing of its own means the offer was acted on. A body's
// offer is an agent's standing ask, so only a finished run (a newer result)
// spends that one; a checkpoint saying "waiting on your pick" must not.
export function offerIsLive(item: HasFields & { answer?: string }): boolean {
  if (!itemOptions(item).length) return false;
  const field = optionsFrom(item);
  const offered = writtenAt(item, field);
  const later: OptionsField[] = field === 'body' ? ['result'] : ['result', 'note'];
  if (later.some((f) => f !== field && writtenAt(item, f) > offered)) return false;
  if (!item.answer || item.answer === '(withdrawn)') return true;
  const spoke = item.wrote?.answer?.ts ?? 0;
  return offered > spoke;
}

// THE OPTION THAT CLOSES THE TASK (w-1df18b337a). Once a run has shipped, the
// one honest next move is often to close the row, and agents are told to offer
// exactly "Close this task". A pick is a reply, and a reply on a finished row
// starts a run, so this is caught and done the way E does it instead. Only the
// whole option: "Ship it, then close the task" is still a reply.
export function closesTheTask(option: string): boolean {
  const words = option.replace(/\s*\(recommended\)\s*/i, '').trim().replace(/[.!]+$/, '');
  return /^close (this|the) (task|thread)$/i.test(words);
}

// What Enter means in the schedule box, in one place so the key handler and the
// preview beside it cannot disagree about whether the typed words counted.
//
// TYPED TEXT ALWAYS DECIDES. Text we could not read is a REFUSAL, never a
// fall-through to whichever preset happens to be highlighted: that fall-through
// is what scheduled an item for thirty minutes when the user typed "tomorrow", while
// the preview beside the box was already admitting it did not understand
// (tests/snooze-honours-what-she-typed.test.mjs).
export type EnterMeans = 'typed' | 'refuse' | 'selected';

export function enterMeans(text: string, parsed: unknown): EnterMeans {
  if (!text.trim()) return 'selected';
  return parsed ? 'typed' : 'refuse';
}

// A time typed in words, for every box that takes one: Schedule, Send later
// and the When menu. The grammar lives in ./when-words.ts; this only puts the
// label on it. Deterministic and no model: a phrase it cannot read is refused
// and says so, rather than guessed at.
export function parseWhen(raw: string, now = Date.now()): { ts: number; label: string } | null {
  const ts = readMoment(raw ?? '', now);
  return ts === null ? null : stamp2(ts, now);
}

/* ------------------------------- recurrence ------------------------------ */
// The repeat grammar.
//
// The third answer is the whole reason this is not a boolean. With two answers,
// a phrase it cannot read is indistinguishable from prose, so it would silently
// become a one-shot, and an absent tag says nothing: she would find out
// tomorrow, when the thing she set up did not happen.
export type RepeatParse =
  | { rule: RepeatRuleValue; label: string }
  | { unreadable: true }
  | null;

// Recurrence is read from the FIRST LINE, two ways, because she writes it two
// ways. Setting one up front opens with it, and changing one mid-thread buries
// it. The reply field only ever sees the second shape, so an opener-only
// grammar showed her nothing exactly where she was most likely to type.
//
// At the START of a clause the time is optional, because "every morning" there
// is unambiguously an instruction. ANYWHERE ELSE it must carry an explicit
// time, which is what keeps "the counter reads zero every day" prose.
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
// Spelled out rather than a prefix wildcard: `sat[a-z]*` reads "satisfy the
// customer" as Saturday, and this grammar is allowed to say no but never to
// invent a schedule. The trailing \b in the patterns below is what lets the
// short forms sit safely beside the long ones.
const DAY_WORD = String.raw`(?:sun|sunday|sundays|mon|monday|mondays|tue|tues|tuesday|tuesdays|wed|weds|wednesday|wednesdays|thu|thur|thurs|thursday|thursdays|fri|friday|fridays|sat|saturday|saturdays)`;
// A BARE DAY NAME IS A DATE, NOT A RHYTHM. "Thursday at 8am" is the next
// Thursday and nothing after it; only the plural or an "every" makes it a
// habit. This list used to be `DAY_WORD` below, so "thursday at 8am" was read
// as a weekly rule and there was no way left to ask for the single run: the
// recurrence grammar gets first look by design (`readWhen`), so it took the
// phrase before parseWhen ever saw it.
const DAY_PLURAL = String.raw`(?:sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays)`;
const RHYTHM = String.raw`(?:(?:every|each)\s+(?:other\s+day|weekday|weekdays|day|morning|night|evening|${DAY_WORD})|daily|weekdays?|${DAY_PLURAL})`;
const OPENER_RE = new RegExp(`^${RHYTHM}\\b`, 'i');
const BURIED_RE = new RegExp(`\\b(${RHYTHM})\\s+(?:at\\s+)?([0-9][^,.]*)`, 'i');
const UNKEEPABLE_RE = /other day|night|evening/i;

export function parseRepeat(raw: string): RepeatParse {
  const line = (raw ?? '').split('\n')[0].trim().toLowerCase().replace(/\s+/g, ' ');
  if (!line) return null;

  for (const clause of line.split(',')) {
    const opener = clause.trim().match(OPENER_RE);
    if (!opener) continue;
    if (UNKEEPABLE_RE.test(opener[0])) return { unreadable: true };
    const rest = clause.trim().slice(opener[0].length).trim();
    // An explicit "at" is a PROMISE of a time, so what follows it has to be one:
    // "every day at half past nine" is a recurrence this cannot keep and must
    // say so. Without "at", the rest is the task itself and the hour defaults,
    // the way every day-shaped answer in parseWhen already does.
    const at = rest.match(/^at\s+(.+)$/);
    return at ? shapeOf(opener[0], at[1]) : shapeOf(opener[0], '');
  }

  const buried = line.match(BURIED_RE);
  if (buried) {
    if (UNKEEPABLE_RE.test(buried[1])) return { unreadable: true };
    return shapeOf(buried[1], buried[2]);
  }
  return null;
}

/**
 * A rule typed ALONE in a box, which is every picker that asks how often: the
 * When picker (`readWhen`) and the composer's Repeat it page. The same grammar
 * as `parseRepeat`, with one difference. A box holds nothing but the rule, so a
 * time after the rhythm is the time even without "at": "every day 5pm" is
 * five, where at the top of a message the "5pm" would be the task and the
 * hour would default to eight (tests/repeat-it-takes-a-rule-in-words.test.mjs).
 */
export function readRule(raw: string): RepeatParse {
  const phrase = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!phrase) return null;
  const timed = phrase.match(/^(.+?) (?:at )?(\d{1,2}(?::\d{2})? ?(?:am|pm)?)$/i);
  return (timed && parseRepeat(`${timed[1]} at ${timed[2]}`)) || parseRepeat(phrase);
}

// Which of the three shapes the words asked for, and at what hour. The default
// is 8am, the hour every day-shaped answer in parseWhen already lands on, and
// that default is part of the contract rather than an accident.
function shapeOf(rhythm: string, timeText: string): RepeatParse {
  const at = timeText ? timeOf(timeText) : '08:00';
  if (!at) return { unreadable: true };
  const words = rhythm.toLowerCase();
  if (/weekday/.test(words)) return repeatRule({ every: 'weekday', at });
  const day = WEEKDAYS.findIndex((name) => new RegExp(`\\b${name.slice(0, 3)}`).test(words));
  if (day >= 0 && !/every day|each day|daily|morning/.test(words)) {
    return repeatRule({ every: 'week', on: day, at });
  }
  return repeatRule({ every: 'day', at });
}

function timeOf(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const mer = m[3];
  if (minute > 59 || hour > 23) return null;
  if (mer === 'pm' && hour < 12) hour += 12;
  if (mer === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function repeatRule(rule: RepeatRuleValue): RepeatParse {
  return { rule, label: ruleLabel(rule) };
}

function stamp2(ts: number, now: number): { ts: number; label: string } {
  const d = new Date(ts);
  const days = Math.floor((ts - startOfDay(now)) / 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = days === 0 ? 'today' : days === 1 ? 'tomorrow'
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return { ts, label: `${day}, ${time}` };
}

// Markdown out, one line in. ONE copy of this rule, because search reads the
// same text the row does and the two must agree about what the words even are:
// a query that matched `**conversion**` and a row that printed "conversion"
// would highlight nothing, and a row is the only evidence she has that a search
// worked. previewText is this with the row's own 200-character ceiling on it;
// search wants the whole task, since the sentence that matched is usually a
// long way past the first paragraph.
//
// A HEADING IS DROPPED FOR A PREVIEW AND KEPT FOR SEARCH, and that one
// difference is why there are two of these. On the row, a heading is a label
// for what follows and never the news, so a preview that opened with it would
// spend both its lines saying nothing. In search it is the opposite: a heading
// is a landmark, which is exactly the kind of half-remembered line she types.
// Measured on a real store: a task whose body carried the heading
// "Where the code is and how to work" could not be found by typing "how to
// work" at all, because the only copy of those words was a heading and the
// searchable text had none.
function flatten(body: string, headings: 'drop' | 'keep'): string {
  return body
    .replace(/^#{1,4}\s.*$/gm, (line) => (headings === 'keep' ? line.replace(/^#{1,4}\s*/, '') : ''))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
}

export function plainText(body?: string): string {
  return body ? flatten(body, 'drop') : '';
}

// The same text, with the headings still in it. Search reads THIS.
export function searchText(body?: string): string {
  return body ? flatten(body, 'keep') : '';
}

export function previewText(body?: string): string {
  return plainText(body).slice(0, 200);
}

// A LABEL IS NOT WHAT WAS SAID (w-560647d4db).
//
// A conversation's row in the list prints one line of the newest message, and
// it was printing the message's first line whatever that line was. On the first
// real conversation between two teammates that line was "Additional:", on its
// own, with the findings under it — so the row said nothing at all, and the
// list "looked a bit weird".
//
// So a message's line is the first line of it that is a line rather than a
// heading for one.
//
// WHAT COUNTS AS A LABEL IS DELIBERATELY NARROW: short, ending in a colon, with
// nothing after the colon. "Here is what I found in the three files I read this
// morning:" ends in a colon and is a sentence, and skipping it would be the
// same fault the other way round. A message that is nothing BUT a label prints
// the label, because printing nothing is worse.
const LABEL_CHARS = 32;

export function firstRealLine(text?: string): string {
  const lines = (text ?? '').split('\n').map((l) => plainText(l)).filter(Boolean);
  const real = lines.find((l) => !(l.length <= LABEL_CHARS && l.endsWith(':')));
  return real ?? lines[0] ?? '';
}
