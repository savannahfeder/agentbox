// ONE ROW PER CAUSE (w-bb45118b10).
//
// A thread stuck on something outside its own work (a sign-in, the computer,
// git or GitHub, a broken main) parks behind a cause row instead of asking the
// person itself. The cause row is an ordinary row the app starts on its own;
// the agent on it is the lead, who clears the cause or asks once for every
// thread behind it. Closing it is what lets those threads carry on, through
// the waits every row already has (`blockedBy`, resumeFinishedWaits).

export const CAUSE_LABEL = 'cause';
export const CAUSE_KIND = 'cause';

/** A cause row the app filed. An agent writing the label on its own row does not make one. */
export function isCause(item) {
  return item?.kind === CAUSE_KIND && (item.labels ?? []).includes(CAUSE_LABEL)
    && item.wrote?.kind?.source !== 'agent';
}

/** The threads still waiting on this cause, from every project. */
export function waitingOn(cause, items) {
  return (items ?? []).filter((i) => i.id !== cause.id && i.status !== 'done'
    && Array.isArray(i.blockedBy) && i.blockedBy.includes(cause.id));
}

/** "6 waiting", for the Status column. */
export function causeWord(n) {
  return `${n} waiting`;
}

/** Where the cause is, for the Project column: its own project, or every project when its threads span more than one. */
export function causeWhere(cause, waiting, ownName) {
  const products = new Set([cause.product, ...waiting.map((i) => i.product)].filter(Boolean));
  return products.size > 1 ? 'All projects' : ownName;
}

/** The open cause rows, newest first. */
export function openCauses(items) {
  return (items ?? []).filter((i) => isCause(i) && i.status !== 'done')
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

const DAY = 86_400_000;
/** A closed cause of the same name in the last two weeks: it came back. */
export function cameBack(title, items, now = Date.now()) {
  const same = String(title ?? '').trim().toLowerCase();
  return (items ?? []).some((i) => isCause(i) && i.status === 'done'
    && String(i.title ?? '').trim().toLowerCase() === same && now - (i.updatedAt ?? 0) < 14 * DAY);
}

/** What the lead on a cause row is told. */
export function leadBrief({ cause, ask, from, again = false }) {
  return [
    `Several threads may get stuck on this, and they wait on this row instead of each asking the person: ${cause}`,
    '',
    `The first to hit it was ${from}. It said:`,
    '',
    ...String(ask ?? '').trim().split('\n').map((l) => `> ${l}`),
    '',
    'You are the lead on this cause. Read every thread waiting on it (list_work_items, and each one\'s blockedBy names this row), then:',
    '',
    '1. Clear it yourself if no person is needed. When it is cleared, check that the thing that failed now works, then set this row done. Every thread waiting on it carries on by itself.',
    '2. Otherwise ask the person once, for all of them. Open with what to do and how many threads it unblocks, name each waiting thread, and give numbered steps. When they say it is done, check it really works before you set this row done. The check is the thing that failed, not something near it: a push, not a read.',
    again
      ? '3. This cause was closed in the last two weeks and has come back. Besides clearing it, file one thread under this row (create_work_item with parent) to stop it happening again, saying what keeps causing it.'
      : '3. Keep to this cause. Do not do the waiting threads\' own work.',
  ].join('\n');
}

/** A cause row's history without the brief the app wrote for its lead, for drawing to the person. */
export function withoutBrief(lines) {
  return (lines ?? []).map((l) => {
    if (l?.source !== 'system' || typeof l.patch?.body !== 'string') return l;
    const { body, ...rest } = l.patch;
    return { ...l, patch: rest };
  });
}
