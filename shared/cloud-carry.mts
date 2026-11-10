// THE COMPUTER'S OWN WORK, HANDED TO THE CLOUD WHILE IT SLEEPS.
//
// A shut Mac wakes for a few seconds every quarter of an hour. Too short to
// start a run (packing alone takes longer), and a run started then dies at the
// next wake. Long enough to write one line per waiting row into the phone's
// command table, which the cloud server starts from the thread's kit the way
// it starts a reply sent from the phone (cloud/gateway/phone.mjs). Shared by
// the computer, the server and the phone, so all three read the mark the same.

export const CARRIED = 'computer';

/** Any command row, as the phone's table, the server or the screen holds it. */
type CommandLike = { payload?: { carried?: unknown; notBefore?: unknown } | null } | null | undefined;

export interface CarryItem {
  id?: string;
  product?: string;
  title?: unknown;
  body?: unknown;
  answer?: unknown;
  model?: string | null;
  effort?: string | null;
}

export interface CarryRepeat {
  rule: string;
  key: string;
}

export type CarriedCommand = {
  project: string;
  item: string;
} & ({
  kind: 'reply';
  payload: { carried: typeof CARRIED; text: string; notBefore?: number };
} | {
  kind: 'run-now';
  payload: {
    carried: typeof CARRIED;
    title: string;
    body: string;
    engine?: string;
    model?: string;
    effort?: string;
    notBefore?: number;
    repeat?: CarryRepeat;
  };
});

/** Whether a command is the computer's own hand-over rather than something the phone sent. */
export const isCarried = (cmd: unknown): boolean => (cmd as CommandLike)?.payload?.carried === CARRIED;

// A pass this late means the process was frozen (Supervisor SLEPT_GAP_MS).
export const SLEPT_GAP_MS = 2 * 60_000;
// After a wake, this long passes before the Mac counts as awake on its own.
// Dark wakes measured on a MacBook Air: 2 to 21 seconds.
export const ASLEEP_SETTLE_MS = 60_000;
// How far ahead a sleeping Mac hands over what comes due, each with its
// moment, so it starts on time even if the Mac never wakes again.
export const CARRY_AHEAD_MS = 12 * 3600_000;
// A hand-over the cloud has not started this long after the moment it could
// have is written again, as a fresh command. The server gives one command
// three tries five minutes apart (cloud/gateway/phone.mjs PHONE_TRIES) and
// then leaves it to the computer for good, and a sleeping computer takes
// nothing back, so without this a reply sent to a cloud that was failing
// waited for the lid to open.
export const CARRY_AGAIN_MS = 30 * 60_000;

/**
 * Whether the computer is in one of a sleeping Mac's short wakes, where a run
 * started would die. True from the first pass after a gap until ASLEEP_SETTLE_MS
 * later, and while a pass is overdue by a gap. A key or mouse touched since
 * the wake is a person at the Mac: `idleMs` under the time since `wokeAt`.
 */
export function macAsleep({ now = Date.now(), lastTickAt = 0, wokeAt = 0, idleMs = null, gapMs = SLEPT_GAP_MS, settleMs = ASLEEP_SETTLE_MS }: {
  now?: number;
  lastTickAt?: number;
  wokeAt?: number;
  idleMs?: number | null;
  gapMs?: number;
  settleMs?: number;
} = {}): boolean {
  const overdue = lastTickAt > 0 && now - lastTickAt >= gapMs;
  const settling = wokeAt > 0 && now - wokeAt < settleMs;
  if (!overdue && !settling) return false;
  if (!overdue && Number.isFinite(idleMs) && idleMs! < now - wokeAt) return false;
  return true;
}

/**
 * The command that hands one row to the cloud, or null. A row carrying a
 * reply goes as that reply, started from the thread's own kit; a row nobody
 * has run goes as Run now, started from its project's new-thread kit under
 * the row's own id. `notBefore` is the moment it may start; `repeat` names
 * the repeating task a run not yet made belongs to ({ rule, key }).
 */
export function carryCommand({ item, continuation = false, engine = null, notBefore = null, repeat = null }: {
  item?: CarryItem | null;
  continuation?: boolean;
  engine?: string | null;
  notBefore?: number | null;
  repeat?: CarryRepeat | null;
} = {}): CarriedCommand | null {
  if (!item?.id || !item.product) return null;
  const base = { project: item.product, item: item.id };
  const when: { notBefore?: number } = Number.isFinite(notBefore) ? { notBefore: notBefore! } : {};
  if (continuation) {
    if (typeof item.answer !== 'string' || !item.answer.trim()) return null;
    return { ...base, kind: 'reply', payload: { carried: CARRIED, text: item.answer, ...when } };
  }
  const title = String(item.title ?? '').trim();
  if (!title) return null;
  return {
    ...base,
    kind: 'run-now',
    payload: {
      carried: CARRIED,
      title,
      body: String(item.body ?? ''),
      ...(engine ? { engine } : {}),
      ...(item.model ? { model: item.model } : {}),
      ...(item.effort ? { effort: item.effort } : {}),
      ...when,
      ...(repeat ? { repeat } : {}),
    },
  };
}

/** The moment a command may start, or 0 for at once. */
export const notBeforeOf = (cmd: unknown): number => (Number.isFinite(Number((cmd as CommandLike)?.payload?.notBefore)) ? Number((cmd as CommandLike)!.payload!.notBefore) : 0);

/**
 * Whether a hand-over the computer is holding a row for is to be written
 * again: the cloud has neither started it nor given it back CARRY_AGAIN_MS
 * after the moment it could have run. `at` is when it was handed over,
 * `notBefore` the moment it was handed over for.
 */
export function handOverSpent({ at = 0, notBefore = 0, now = Date.now(), againMs = CARRY_AGAIN_MS }: { at?: number; notBefore?: number | null; now?: number; againMs?: number } = {}): boolean {
  if (!at) return false;
  return now - Math.max(at, notBefore || 0) >= againMs;
}
