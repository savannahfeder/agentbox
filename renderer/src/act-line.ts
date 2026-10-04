// PURE. What one of your actions says on its line in the thread (w-49b4e45403).
//
// The ledger's sentence is "You snoozed it" / "You picked option 1", which is
// right for a history and too long for a line that sits between messages. The
// chosen drawing (round4-single) says it in a few words beside a small ring:
// "Snoozed until tomorrow 9:00am", "Picked <the option>", with the time in the
// header's small mono caps. Kept here so a test can hold the wording.

export interface ActWords {
  // The words at reading tone: "Snoozed until tomorrow 9:00am", "Picked".
  lead: string;
  // A pick's option, drawn brighter after `lead`. Null on every other action.
  choice: string | null;
  picked: boolean;
}

/** The line's words. `name` is a teammate's first name, when it was theirs. */
export function actWords(act: { verb: string; subject?: string }, name?: string | null): ActWords {
  const subject = (act.subject ?? '').trim();
  const picked = /^You picked option \d+$/.test(act.verb);
  // "You snoozed it until …" says "it" about the only thing on the page.
  let rest = picked ? 'picked' : act.verb.replace(/^You\s+/, '').replace(/^snoozed it$/, 'snoozed');
  if (!picked && subject) rest += /^was\b/.test(subject) ? `, ${subject}` : ` ${subject}`;
  const lead = name ? `${name} ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1);
  return { lead, choice: picked ? subject : null, picked };
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "TODAY 1:10PM", "THU 4:10PM", "SEP 27 4:00PM". Short, because it is a mark, not a heading. */
export function actWhen(at: number, now = Date.now()): string {
  if (!at) return '';
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  const d = new Date(at);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '');
  const day = days <= 0 ? 'Today'
    : days === 1 ? 'Yesterday'
    : days < 7 ? d.toLocaleDateString('en-US', { weekday: 'short' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} ${time}`.toUpperCase();
}
