// WHAT IS LEFT OF A LIMIT, WHICHEVER CODING AGENT REPORTED IT.
//
// The corner meter and its dropdown were built against `claude -p /usage` and
// nothing else. They are drawn on every screen, unlabelled, and they describe a
// Claude Code subscription whether or not the work in front of her is billing
// one. That is the same class of defect he had already caught on the Settings
// Model row: a control that looks as though it belongs to the coding agent named
// elsewhere on the screen, and does not.
//
// SO THE PANEL'S WORDS LEFT THE CLAUDE FILE, and that move is the point rather
// than tidying. A Codex reading flowing through a module called `claude-usage`
// is the same defect written in source: the next person to add a Claude-shaped
// assumption to it would have no reason not to. What is Claude Code's stays
// there -- the text format, the timezone stamp it prints, `readUsage` --
// and what belongs to a LIMIT, any limit, is here.
//
// TWO THINGS DID NOT CARRY OVER, AND SAYING SO IS THE POINT OF THIS PARAGRAPH.
// Claude Code prints a clock time in a named zone and no instant, so the whole
// of `resetAt` / `wallIn` / `instantIn` exists to turn "Sep 3 at 3:59pm
// (America/Los_Angeles)" into a moment, and to REFUSE when it cannot be done
// honestly. Codex hands over an absolute instant and no text at all. Those are
// different problems and neither reader may be forced into the other's shape.
// What is genuinely shared is everything after the reading: the countdown, the
// rows, the sentence, and the rule for which agent the corner is about.
//
// AND A LIMIT NOW CARRIES ITS OWN NAME. `limitName` used to derive one from
// Claude Code's three spans and its qualifier, which is how "This week, Fable"
// -- a Claude model -- could have appeared over a Codex reading. Each reader
// names its own limits, in plain words, and this file prints the name it is
// given.

import { DEFAULT_ENGINE } from './engines.mjs';

/* ------------------ WHICH CODING AGENT THE CORNER IS ABOUT ---------------- */

/**
 * THE AGENT MOST OF HER LIVE WORK IS ON, or the workspace's own when nothing is
 * running and when the fleet is level.
 *
 * IT IS THE RULE THE BYLINE ALREADY FOLLOWS, one level up. renderer/src/byline.ts
 * settled this for a row a slice ago -- "WHAT IS RUNNING BEATS WHAT WOULD RUN" --
 * and the corner asks the same question about the whole app. Two rules for one
 * question is how "Medium" and "medium" ended up on adjacent screens.
 *
 * WHY NOT THE WORKSPACE AGENT ALWAYS. It is stabler, and it is wrong in exactly
 * the case that was reported: four Codex workers under a workspace defaulting to
 * Claude Code would draw Claude Code's meter at 12% while the thing about to
 * stop the fleet sits at 96% on the other subscription. A meter that is stable
 * and describes the wrong account is the defect, not the fix.
 *
 * WHY IT COUNTS RATHER THAN ASKING "IS ANY CODEX RUNNING". A rule that flipped
 * the moment one worker of the other kind started would change the SUBJECT of
 * the corner several times a minute on a mixed fleet, and she would be reading a
 * history of two subscriptions in one bar. Counting moves it only when the
 * balance of the fleet really moves. The level case has no answer of its own, so
 * it falls back to the one answer that is always available.
 *
 * The engine on a session is already one of exactly two words: `Supervisor#status`
 * puts every record through `engineOf` first, and a record written before the
 * second engine existed comes out as Claude Code. A session with no engine on it
 * at all is not counted here rather than counted as a third thing.
 */
export function usageEngine({ workspace = DEFAULT_ENGINE, running = [] } = {}) {
  const tally = new Map();
  for (const session of running ?? []) {
    const id = session?.engine;
    if (typeof id !== 'string' || !id) continue;
    tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  let best = null;
  let most = 0;
  let level = false;
  for (const [id, count] of tally) {
    if (count > most) { best = id; most = count; level = false; } else if (count === most) level = true;
  }
  return best === null || level ? workspace : best;
}

/* --------------------- reading a clock in a named zone -------------------- */
// The two primitives the zone-honesty of shared/claude-usage.mjs rests on, and
// the one question this file asks about a day. They exist because
// `new Date(y, m, d, h, min)` and `Date#getDate` are the PROCESS's zone and
// nothing else, and every question about a reset is about hers.
//
// A ZONE WE CANNOT USE FALLS BACK TO THE PROCESS'S, DELIBERATELY. `zone` is null
// when `Intl` would not answer at all, and a name Intl rejects throws; in both
// cases the old behaviour is the best guess left and is exactly right on the only
// machine that matters, hers. It is a fallback and never a first choice: when we
// are told the zone we use the zone.

export function localZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

const WALL = {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
};

/** What a clock in `zone` reads at instant `ms`, or null if it cannot be asked. */
export function wallIn(ms, zone) {
  if (!zone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, ...WALL }).formatToParts(new Date(ms));
    const at = (type) => Number(parts.find((p) => p.type === type)?.value);
    // `hour12: false` prints midnight as 24 in some engines and 0 in others.
    const read = {
      year: at('year'), month: at('month'), day: at('day'),
      hour: at('hour') % 24, minute: at('minute'), second: at('second'),
    };
    return Object.values(read).every(Number.isFinite) ? read : null;
  } catch { return null; }
}

/**
 * THE INSTANT AT WHICH A CLOCK IN `zone` READS THIS WALL TIME.
 *
 * Two passes and not one, and the second is the DST correction rather than
 * defensiveness: the offset has to be sampled at an instant, the first sample
 * is taken at the wall time pretending to be UTC, and on the two days a year
 * that lands on the far side of a transition the sample is the wrong offset by
 * an hour. Sampling again at the instant the first pass produced puts it inside
 * the same offset as the answer. A wall time that does not exist (the spring
 * gap) or happens twice (the autumn overlap) settles on one of the two, which is
 * what every other reader of a bare clock time does and is a whole hour better
 * than being in the wrong zone.
 */
export function instantIn(year, monthIndex, day, hour, minute, zone) {
  const local = () => new Date(year, monthIndex, day, hour, minute, 0, 0).getTime();
  if (!zone) return local();
  const wanted = Date.UTC(year, monthIndex, day, hour, minute, 0);
  let ms = wanted;
  for (let pass = 0; pass < 2; pass += 1) {
    const w = wallIn(ms, zone);
    if (!w) return local();
    ms = wanted - (Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - ms);
  }
  return ms;
}

/**
 * WHETHER TWO MOMENTS ARE THE SAME DAY WHERE SHE IS, which is what decides
 * whether a reset needs its date said out loud. By calendar date rather than by
 * arithmetic on hours, for the same reason the repeating tasks are: DST and a
 * clock correction have to be boring.
 *
 * IN A NAMED ZONE, for the same reason `resetAt` builds its instant in one
 * (2026-09-04). "Is this reset today" is a question about her calendar, and
 * reading it off the process's clock answered it about the machine's instead:
 * the same instant is Sep 1 in Los Angeles and Sep 2 in Berlin, so the panel's
 * "Resets 4pm" became "Resets Sep 1 at 4pm" purely by moving desks.
 */
function sameDay(a, b, zone) {
  const x = wallIn(a, zone), y = wallIn(b, zone);
  if (x && y) return x.year === y.year && x.month === y.month && x.day === y.day;
  const p = new Date(a), q = new Date(b);
  return p.getFullYear() === q.getFullYear() && p.getMonth() === q.getMonth() && p.getDate() === q.getDate();
}

/* ------------------------------ the countdown ----------------------------- */

/**
 * The five hour limit, which is the one that stops her today. Claude Code
 *  prints it as "Current session"; Codex reports it as the `primary` window,
 *  measured at 300 minutes. Both readers mark it `span: 'session'`. */
export function sessionLimit(limits) {
  return (limits ?? []).find((l) => l.span === 'session') ?? null;
}

/**
 * THE ONE LIMIT THE CORNER IS ABOUT, on an account that may not have a five hour
 * window at all.
 *
 * The bar used to be the session limit or nothing, and on 2026-09-18 that turned
 * out to mean NOTHING on the founder's own Codex plan: measured across the 1,140
 * rate-limit records in her twenty-five most recent Codex sessions, every window
 * she has is a seven day one and `secondary` is never populated. Her weekly limit
 * was at 100% used that day, which is exactly the moment a person needs the
 * corner, and the corner would have been blank.
 *
 * The session window still wins whenever there is one, because it is the one that
 * stops her today. When there is not, the fullest window she does have is drawn
 * instead: a limit at 100% decides whether she can start six agents, whatever
 * span it runs over. Null only when there is truly nothing, which stays the
 * honest empty corner it has always been.
 */
export function headlineLimit(limits) {
  const session = sessionLimit(limits);
  if (session) return session;
  let best = null;
  for (const limit of limits ?? []) {
    if (!Number.isFinite(limit?.percent)) continue;
    if (!best || limit.percent > best.percent) best = limit;
  }
  return best;
}

/**
 * HOW LONG UNTIL IT STARTS OVER, in her house style: whole minutes, then hours
 * and minutes, and never a seconds counter.
 */
export function untilReset(ms) {
  const span = spanLeft(ms);
  return span === ANY_MOMENT ? span : `${span} left`;
}

/**
 * THE SAME COUNTDOWN WITHOUT THE WORD "left" ON THE END, for the callers that
 * put a preposition in front of it instead. It is the same rule and the same
 * rounding; `untilReset` is this plus a suffix, so the two cannot drift into
 * disagreeing about what 90 minutes is. */
export const ANY_MOMENT = 'any moment';
export function spanLeft(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return ANY_MOMENT;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  // AND DAYS PAST A DAY, which the session limit never needs and the WEEKLY ones
  // always do. The first version of this stopped at hours and read "71h 12m
  // left" on her week, which is a number a person has to do arithmetic on before
  // it means anything. The minutes come off at that range too: nobody reads a
  // weekly allowance to the minute.
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return rest ? `${days}d ${rest}h` : `${days}d`;
  }
  return `${hours}h ${minutes % 60}m`;
}

/* -------------------------------- the panel ------------------------------- */

/**
 * THE PANEL'S ROWS, ONE PER LIMIT, COUNTING WHAT HAS BEEN SPENT.
 *
 * IT COUNTED WHAT WAS LEFT FOR ABOUT AN HOUR AND THAT WAS WRONG.
 *
 * That is the QUESTION, and "45% used" is a fine answer to it. A bar is not a
 * sentence, and every bar anybody has used fills as the thing is consumed.
 *
 * SO `used`, STRAIGHT FROM THE READING, and no `left` anywhere for a caller to
 * reach for by mistake.
 *
 * THE ORDER IS THE READER'S OWN, which is the five hour one first and the one
 * that stops her today.
 *
 * AND `when` IS A CLOCK TIME, WITH THE DAY WHEN THE DAY IS NOT TODAY. Claude
 * Code prints "Resets 9:59pm" for the session and "Resets Sep 3 at 3:59pm" for
 * the week, and that solves the ambiguity a countdown was invented to dodge on
 * the round before: the week's stamp is "4pm" and reads as today when it is
 * Thursday's. Saying the day is the better answer and it is the one she is
 * pointing at.
 *
 * A READING THAT CARRIES AN INSTANT AND NO CLOCK TEXT COUNTS DOWN INSTEAD,
 * which is the Codex shape and is unreachable for Claude Code: `resetsAt` is
 * only ever non-null there when the same regex already produced `resetsText`.
 * Formatting Codex's instant into a clock time would mean inventing a second
 * copy of the zone machinery next door, to print a fact we already hold exactly
 * -- so the fact we hold is what gets printed, in the countdown wording this
 * file already owns.
 *
 * `when` stays null rather than invented when there is no reset at all, which is
 * what Claude Code gives for a limit at 0% and what Codex's nullable `resetsAt`
 * gives. And when a Claude stamp was computed in another timezone we cannot say
 * which local day it lands on, so the whole stamp goes out as the command wrote
 * it: true either way, and still refusing to guess.
 *
 * WHICH DAY "TODAY" IS gets asked in the limit's OWN zone, which is the zone the
 * CLI printed beside the stamp. That is not a third source of truth: `resetsAt`
 * is null unless that zone is the one `readUsage` was told this machine is in
 * (`resetAt`'s standing refusal), so by the time this line is reached the two
 * are the same zone and the stamp's copy of it is the one in hand. A reading
 * with no zone on it at all falls back to the process's, which is what it always
 * was, and is every Codex reading.
 */
export function limitRows(limits, now = Date.now()) {
  const here = localZone();
  return (limits ?? []).map((l) => ({
    // Stable across redraws, and it has to carry the qualifier: Claude Code's
    // two week rows are otherwise the same string.
    key: `${l.span}:${l.qualifier ?? ''}`,
    name: l.name,
    used: l.percent,
    when: whenItStartsOver(l, now, here),
  }));
}

function whenItStartsOver(l, now, here) {
  if (l.resetsText) {
    if (l.resetsAt && sameDay(l.resetsAt, now, l.zone ?? here)) return `Resets ${l.resetsText}`;
    return l.resetsOn ? `Resets ${l.resetsOn} at ${l.resetsText}` : `Resets ${l.resetsText}`;
  }
  if (!l.resetsAt) return null;
  const soon = spanLeft(l.resetsAt - now);
  return soon === ANY_MOMENT ? `Resets ${soon}` : `Resets in ${soon}`;
}

/**
 * THE WHOLE SENTENCE, for whatever reads the corner aloud and for the tooltip.
 * It says every limit, because the corner itself is a bar with no words in it at
 * all and a summary has to expand into the thing it summarised.
 *
 * AND IT NAMES THE CODING AGENT WHERE THERE IS ONE TO NAME (2026-09-05). The
 * bar has no words in it, so this sentence IS the corner for anybody who cannot
 * see it; labelling the dropdown and leaving this unlabelled would answer the
 * tester's ask for one reader and not the other. `engineWord` is null on every
 * Mac with one coding agent -- `engineWordFor` in renderer/src/byline.ts is the
 * one rule for that, and it is the same rule the panel's heading follows -- and
 * then this is byte for byte the sentence she has been reading since
 * 2026-09-01.
 */
export function usageSentence(limits, now = Date.now(), engineWord = null) {
  if (!limits?.length) return null;
  const said = limits.map((l) => {
    const when = l.resetsAt ? `, ${untilReset(l.resetsAt - now)}` : l.resetsText ? `, resets ${l.resetsText}` : '';
    return `${l.name}: ${l.percent}% used${when}.`;
  }).join(' ');
  return engineWord ? `${engineWord}. ${said}` : said;
}
