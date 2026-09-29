// WHAT IS LEFT OF HER LIMIT, OUT OF CLAUDE CODE'S OWN `/usage`.
//
// He is right that it is the number that decides how many agents get started,
// and right that going elsewhere to read it defeats the point of the inbox.
//
// THERE ARE THREE LIMITS, NOT ONE, and that is the first thing measuring changed
// about his ask. Verbatim off her Mac, 2026-08-31 16:47:
//
//   Current session: 29% used · resets Aug 31 at 6:19pm (America/Los_Angeles)
//   Current week (all models): 6% used · resets Sep 3 at 3:59pm (America/Los_Angeles)
//   Current week (Fable): 2% used · resets Sep 3 at 3:59pm (America/Los_Angeles)
//
// AND IT IS SLOW. Timed twice on the same machine: 23.2s and 28.0s. So this can
// never be live, and nothing that reads it may block a window being drawn.
//
// This file is the PURE half: the text in, the three limits out. It is pure so
// the reading is pinned by tests rather than by a screenshot. Running the
// command is main/claude-usage.mjs.
//
// THE WORDS THE PANEL PRINTS LEFT THIS FILE ON 2026-09-05, and they went to
// shared/usage.mjs. What is Claude Code's is still here: this text format, the
// timezone stamp it prints, and the refusal to count down from a stamp computed
// somewhere else. What belongs to a LIMIT, any limit, is next door.

import { instantIn, localZone, sessionLimit, untilReset, wallIn } from './usage.mjs';

/** One limit, as the CLI reported it. */
// { span, qualifier, name, percent, resetsAt|null, resetsText, resetsOn, zone }

const LINE = /^Current\s+(session|week)(?:\s*\(([^)]+)\))?\s*:\s*(\d+)%\s*used(?:\s*·\s*resets\s+(.+?))?\s*$/i;
// THE MINUTES ARE OPTIONAL, AND THAT IS WHY THE CORNER WENT QUIET. Claude Code
// drops the ":00" when a reset lands on the hour, so a stamp reads "Sep 1 at
// 4pm" and this refused it. Refusing it took the countdown out of the pill AND
// out of the tooltip, which left a wordless percentage nobody could read. It
// is one hour in every five.
//
// THE AM/PM HALF STAYS REQUIRED. An hour on its own is ambiguous by twelve
// hours, and the standing rule in this file is to refuse rather than guess.
const RESET = /^([A-Z][a-z]{2})\s+(\d{1,2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*([ap])m(?:\s*\(([^)]+)\))?/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * WHEN A RESET ACTUALLY IS, from the stamp the CLI prints.
 *
 * The stamp has no year on it, so the year is taken from `now` and rolled
 * forward when that would put the reset more than a day in the past, which is
 * the December-to-January case and the only one it can be.
 *
 * IT REFUSES RATHER THAN GUESSES WHEN THE ZONE IS NOT THIS MACHINE'S. Claude Code
 * prints the zone it computed the stamp in. When that is the zone this machine is
 * in, reading "6:19pm" as local time is exactly right. When it is not, the
 * difference is however many hours, and a countdown built on that would be
 * confidently wrong. So it returns null and the caller prints the clock time
 * instead, which is true in either case.
 *
 * AND THE CLOCK TIME IS READ IN THAT ZONE, NOT IN THE PROCESS'S (2026-09-04).
 * This function has taken `zoneNow` since it was written, and used it for the
 * refusal above and for nothing else: the instant itself came out of
 * `new Date(y, m, d, h, min)`, which reads those fields in whatever zone the
 * PROCESS happens to be in. On her Mac the two are the same zone and every
 * answer was right, which is why it survived. Anywhere else it is silently out
 * by the difference: running this suite in Asia/Tbilisi against her verbatim
 * America/Los_Angeles reading put every reset eleven hours early, which turned
 * `pillText`'s "2h 14m left" into "any moment" and made the panel print
 * "Resets Sep 1 at 4pm" for a reset that was today. A function handed the
 * moment AND the zone and then reading one of them off the machine cannot be
 * tested, and it rots the day it leaves the desk it was written on.
 */
export function resetAt(text, now = Date.now(), zoneNow = localZone()) {
  const m = RESET.exec(String(text ?? '').trim());
  if (!m) return null;
  const [, mon, day, hour12, minute, half, zone] = m;
  if (zone && zoneNow && zone !== zoneNow) return null;
  const month = MONTHS.indexOf(mon.toLowerCase());
  if (month < 0) return null;
  let hour = Number(hour12) % 12;
  if (half.toLowerCase() === 'p') hour += 12;
  // Absent minutes mean the hour exactly, which is what the CLI means by
  // printing "4pm". It is a default for a stamp that omitted them, never a
  // guess at ones it printed and we failed to read.
  const min = minute === undefined ? 0 : Number(minute);
  // The stamp carries no year, so it comes from `now` READ IN THE SAME ZONE the
  // clock time is about to be read in. Taking the year from one zone and the
  // day from another is a one-day error for the few hours a year they disagree.
  const year = wallIn(now, zoneNow)?.year ?? new Date(now).getFullYear();
  let at = instantIn(year, month, Number(day), hour, min, zoneNow);
  // A reset a long way behind us is last year's date read as this year's.
  if (at < now - 24 * 3_600_000) at = instantIn(year + 1, month, Number(day), hour, min, zoneNow);
  return at;
}

/**
 * WHAT EACH LIMIT IS CALLED, IN PLAIN WORDS. One copy, because the sentence the
 *  corner reads aloud and the panel's rows have to agree word for word: they are
 *  on the screen at the same moment, one of them read aloud and one of them read.
 *
 *  SO "all models" IS DROPPED. It is the CLI's qualifier on the week line and it
 *  means every model, which is to say it is not a qualifier at all. Printed, it
 *  put "This week, all models" directly above "This week, Fable", where the
 *  first reads as one subset beside another instead of as the total it is. The
 *  qualifier is still kept on the limit itself and any OTHER one is still
 *  printed, so a fourth line the CLI invents tomorrow arrives named.
 *
 *  IT IS STAMPED ONTO THE LIMIT HERE RATHER THAN DERIVED WHERE THE PANEL DRAWS
 *  (2026-09-05). These are Claude Code's spans and Claude Code's qualifiers, and
 *  the panel draws Codex's limits now too; a namer that ran over every reading
 *  would have had one branch for "session", one for "week" and no honest answer
 *  for anything else -- which is how "This week, Fable", a Claude model, could
 *  have appeared over a Codex reading. Each reader names its own limits. */
function limitName(span, qualifier) {
  if (span === 'session') return 'This session';
  const q = qualifier && qualifier.toLowerCase() !== 'all models' ? qualifier : null;
  return q ? `This week, ${q}` : 'This week';
}

/**
 * EVERY LIMIT THE COMMAND REPORTED, in the order it reported them.
 *
 * Unknown lines are ignored rather than guessed at: the command prints a whole
 * page (requests, sessions, what is contributing to the limits) and this only
 * claims to understand the lines that say a percentage.
 */
export function readUsage(text, now = Date.now(), zoneNow = localZone()) {
  const out = [];
  for (const raw of String(text ?? '').split('\n')) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const [, span, qualifier, percent, resets] = m;
    const reset = RESET.exec(String(resets ?? '').trim());
    const kind = span.toLowerCase();
    const named = qualifier ? qualifier.trim() : null;
    out.push({
      // `session` is the five hour one he asked for. The week lines carry a
      // qualifier ("all models", "Fable") and it is kept as the CLI wrote it.
      span: kind,
      qualifier: named,
      name: limitName(kind, named),
      percent: Math.max(0, Math.min(100, Number(percent))),
      // The whole stamp, always, because it is true even when the countdown
      // cannot be computed.
      // Written back the way the CLI wrote it: "6:19pm" keeps its minutes and
      // "4pm" does not grow a ":00" it never had.
      resetsText: reset ? `${reset[3]}${reset[4] ? `:${reset[4]}` : ''}${reset[5].toLowerCase()}m` : null,
      // AND THE DAY IT FALLS ON, kept separately. The clock time alone is what
      // the panel used to have, and on the two WEEK rows "4pm" reads as today
      // when it is Thursday's. Claude Code prints the day, so we keep the day
      // to print. "Sep 3", as the command wrote it.
      resetsOn: reset ? `${reset[1]} ${Number(reset[2])}` : null,
      resetsAt: resets ? resetAt(resets, now, zoneNow) : null,
      zone: reset?.[6] ?? null,
    });
  }
  return out;
}

/**
 * WHAT THE PILL SAYS. Null when there is nothing honest to print, and then
 * nothing is drawn at all rather than a pill saying it does not know.
 *
 * Two parts, which is what he asked for: "Even a small pill with percent used
 * and time left would do it."
 */
export function pillText(limits, now = Date.now()) {
  const session = sessionLimit(limits);
  if (!session) return null;
  const used = `${session.percent}%`;
  if (session.resetsAt) return { used, when: untilReset(session.resetsAt - now) };
  // No countdown to be had, either because the stamp was missing or because it
  // was computed in another timezone. The clock time is still true.
  if (session.resetsText) return { used, when: `resets ${session.resetsText}` };
  return { used, when: null };
}
