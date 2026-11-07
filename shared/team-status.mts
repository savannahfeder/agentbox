// A STATUS LINE YOU WRITE YOURSELF: the rules, in one place.
//
// Four of six people interviewed asked for the same thing, and the founder
// put it plainest: "If I'm going to spend a day or a few days in meetings, I
// don't want the board to make it seem like I'm not doing any work." So a
// person carries one short line they wrote, and it holds until a time they
// chose.
//
// THE EXPIRY IS READ, NOT SWEPT. An expired line is nothing to everyone who
// reads it, at the moment it expires, without anyone's Mac having to be awake
// to clear it. The owner's Mac also clears it in the cloud on the next sync
// after it lapses, so the text does not sit there for good; that is tidying,
// not what makes it disappear.

/** A line is one line. Longer than this is a note, and the places it is drawn
 *  (a sidebar row, a hover card) cannot hold one. */
export const STATUS_MAX = 80;

/** What the app stores from what somebody typed: trimmed, cut to one line and
 *  to STATUS_MAX, or null when they said nothing. */
export function cleanStatus(text) {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim();
  return one ? one.slice(0, STATUS_MAX) : null;
}

/** The status as it reads NOW: null when there is no text, or when the time
 *  they chose has passed. Everything that draws a status goes through here. */
export function liveStatus(status, now = Date.now()) {
  const text = cleanStatus(status?.text);
  if (!text) return null;
  const until = status?.until ?? null;
  if (until && until <= now) return null;
  return { text, until };
}

/** True when there is text in the cloud that no longer reads, which is the
 *  owner's Mac's cue to clear it. */
export function hasLapsed(status, now = Date.now()) {
  return !!cleanStatus(status?.text) && !!status?.until && status.until <= now;
}

/** How long it holds, in words, for the end of a line: "until 6pm today",
 *  "until Monday", "until Mar 3". Empty when it holds until they clear it. */
export function holdsUntil(until, now = Date.now()) {
  if (!until || until <= now) return '';
  const d = new Date(until);
  if (new Date(now).toDateString() === d.toDateString()) {
    const h = d.getHours();
    const mins = d.getMinutes() ? `:${String(d.getMinutes()).padStart(2, '0')}` : '';
    return `until ${h % 12 === 0 ? 12 : h % 12}${mins}${h < 12 ? 'am' : 'pm'} today`;
  }
  // Inside a week a weekday names itself. Eight days out, "until Monday"
  // would be the Monday after the one they meant, so the date is safer.
  if (until - now < 7 * 86_400_000) return `until ${d.toLocaleDateString(undefined, { weekday: 'long' })}`;
  return `until ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** The four holds the app offers, in the order they are drawn. */
export const HOLDS = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'This week' },
  { id: 'open', label: 'Until I clear it' },
];

/** When a status set now runs out. A moment they chose wins while it is still
 *  ahead ("they should be able to choose their own timelines", 2026-10-04);
 *  anything else, now, the past or not a number at all, falls back to the
 *  named hold, so a stale or garbled moment can never end a status at once. */
export function statusEnds({ hold = 'open', until } = {}, now = Date.now()) {
  if (typeof until === 'number' && Number.isFinite(until) && until > now) return until;
  return holdEnds(hold, now);
}

/** When a hold runs out. Today and tomorrow end at the end of that day, so a
 *  line set at 9am and one set at 4pm both last the day out. */
export function holdEnds(id, now = Date.now()) {
  if (id === 'open') return null;
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  if (id === 'tomorrow') d.setDate(d.getDate() + 1);
  // THE PARENTHESES ARE LOAD BEARING. Written as `d.getDate() + (7 - day) % 7
  // || 7`, `+` binds tighter than `||`, so on a Sunday it read
  // `(11 + 0) || 7` and set the date to today: "this week" ended tonight.
  if (id === 'week') {
    const toSunday = (7 - d.getDay()) % 7;
    d.setDate(d.getDate() + (toSunday || 7));
  }
  return d.getTime();
}
