// THE ONE SENTENCE THE REAL APP OWED SOMEBODY, SAID ONCE.
//
// WHERE IT COMES FROM. The walk had a beat about the practice row an agent is
// stopped on: "This agent is waiting on your answer, and marking it done
// leaves it stuck." It was cut on 2026-10-07 with five other beats, because a
// new user clicked straight through twenty screens (w-d48aa1232e). The other
// five taught a KEY — ⇥, L, B, ⌘K — and every one of those is printed on a
// hint plate, a button or the shortcuts page. This one taught a JUDGEMENT:
// taking a stopped agent out of your inbox is the move this product exists to
// stop, and it leaves the agent waiting forever. After the cut, no screen in
// the app said so.
//
// `closingRefused` and `snoozeRefused` (./onboarding.ts) still refuse E and L
// on that row and say why. They are the WALK'S guard: only while it is on, and
// only on its own staged rows. This file is the same lesson in the real app,
// on real rows, and it is a different shape on purpose.
//
// ---------------------------------------------------------------------------
// REFUSE, OR WARN AND LET IT THROUGH? BOTH, IN THAT ORDER.
//
// The walk refuses, every time, because its whole job is to teach the beat.
// The real app cannot: somebody may really mean it, and a row somebody means
// to close that will not close is the app arguing with its owner about their
// own inbox.
//
// So the FIRST press ever does not land, and the SECOND one does. That buys
// the one thing refusing buys — a guard with no modal that cannot be clicked
// past, at the one moment the lesson is worth anything, which is the moment
// somebody is about to make the mistake — and it costs one keystroke rather
// than a dialog. After that it is never in the way again. The press that goes
// through has the same three second undo every close has had.
//
// AND IT IS ONE MARKER FOR BOTH KEYS, not one each. The lesson is the
// judgement, not the key, and being told twice in two wordings is being
// nagged. Same reasoning, and the same shape, as `neverOffered` in
// ./tutorial.ts: asked once, ever, and then never.
//
// ---------------------------------------------------------------------------
// WHAT COUNTS AS STOPPED is the two things the screen is already showing, so
// the nudge can never name something somebody cannot see:
//
//   - a thread whose agent ended its run offering numbered answers that are
//     still live (`offerIsLive`). The picker is drawn under it; the row is
//     literally asking.
//   - an outside Claude Code session parked on "input needed"
//     (`replyReaches`). This is the literal case: that process sits at its
//     prompt until somebody types, and closing the row touches it not at all
//     (`closeAgentRow` in App.tsx).
//
// A session held at a permission box is NOT one of them, and that is
// deliberate: a reply from here would wait behind that box instead of clearing
// it, so "open it and answer it" would be false advice. It is the same split
// `asksSomething` and `replyReaches` already make in shared/agents.mjs.
//
// A thread with a worker running on it right now is not asked about either,
// because a live offer is what the test reads and a running worker's row sits
// in In progress rather than the inbox.

import { replyReaches } from '../../shared/agents.mjs';
import { offerIsLive } from './format';

const WARNED_KEY = 'zero.stoppedWarned';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The two keys that take a row out of the inbox, and so the two that ask. */
export const STOPPED_WARNING_KEYS = ['E', 'L'] as const;
export type StoppedKey = (typeof STOPPED_WARNING_KEYS)[number];

/**
 * ONE LESSON, TWO VERBS. E closes the row and L puts it off, and both empty the
 *  inbox of an agent that is waiting, so both say the same thing about it: two
 *  wordings of the lesson would be two lessons. Only the verb for what the key
 *  does differs, which is the rule `STOPPED_REFUSAL` keeps in ./onboarding.ts.
 *
 *  The sentence is the one the cut beat used, approved twice, with the way
 *  through added: a press that is refused and then quietly works on the second
 *  try is a key nobody can trust. "Press again" rather than "Press E again"
 *  because this is reached from the pane's own button and from ⌘K as well, and
 *  a button is pressed too. */
const COST: Record<StoppedKey, string> = { E: 'marking it done', L: 'putting it off' };

export function stoppedWarning(key: StoppedKey): string {
  return `This agent is waiting on your answer, and ${COST[key]} leaves it stuck. Press again to go ahead.`;
}

/**
 * WHETHER THE NUDGE MAY BE SAID AT ALL. Unwritten means never told, which is
 *  every install that existed before this landed.
 *
 *  A store that cannot be read reads as ALREADY TOLD, which is the quiet
 *  fallback: a store that throws on every read would otherwise say this on
 *  every press forever, and a repeated sentence is the nagging this is written
 *  to avoid. Same call as `neverOffered` in ./tutorial.ts. */
export function neverWarned(store: Store): boolean {
  try { return store.getItem(WARNED_KEY) !== '1'; } catch { return false; }
}

/** Said, and written down. A refused write is swallowed: see above. */
export function rememberWarned(store: Pick<Storage, 'setItem'>): void {
  try { store.setItem(WARNED_KEY, '1'); } catch { /* see above */ }
}

export interface MaybeStopped {
  id: string;
  product: string;
  result?: string;
  note?: string;
  body?: string;
  answer?: string;
  wrote?: Record<string, { ts: number } | undefined>;
  agent?: { status?: string | null; waitingFor?: string | null } | null;
}

/** Is an agent stopped on this row, waiting on a person? See the header. */
export function stoppedWaiting(item: MaybeStopped): boolean {
  if (item.agent) return replyReaches(item.agent);
  return offerIsLive(item);
}

/**
 * THE WHOLE RULE, AS A VALUE. Null means the press lands and nothing is said.
 *
 *  `rows` is one row for a single close and the ticked set for a batch, because
 *  a selection is the one route that takes a stopped agent out without ever
 *  pointing at it. The row named in `goes` is the first stopped one in the
 *  list, which is the one the pill offers to open.
 *
 *  `walking` vetoes everything. The walk refuses its own rows every time it is
 *  pressed, and a press inside the practice must not be the press that spends
 *  the one nudge somebody gets in the app they actually work in. It cannot
 *  happen today — the walk filters the list down to its own staged rows — but
 *  the veto is stated rather than assumed, because "not reachable" is a fact
 *  about this month's screens. */
export function holdForStoppedAgent(p: {
  rows: readonly MaybeStopped[];
  key: StoppedKey;
  warned: boolean;
  walking: boolean;
}): { say: string; goes: { product: string; id: string } } | null {
  if (p.warned || p.walking) return null;
  const stopped = p.rows.find(stoppedWaiting);
  if (!stopped) return null;
  return { say: stoppedWarning(p.key), goes: { product: stopped.product, id: stopped.id } };
}
