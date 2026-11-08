// PURE. A NUMBER DOES NOT ANSWER A THREAD THAT ARRIVED UNDER YOU.
//
// Two halves of the design are both wanted: a number picks without a
// confirmation (the strip draws the numbers, so the press is the answer), and
// answering from Needs you moves you on, which is what makes clearing an inbox
// a flow rather than a round trip (./advance). The seam between them is not
// wanted. The advance replaces the thread on screen while your hand is still
// over the keys, so a second press aimed at the thread you were reading lands
// on one you have not read, and that press SHIPS something. Nothing else in the
// app can send to the wrong thread with one keystroke.
//
// So a number is inert for a moment after THE APP moved you, and only then:
// opening a thread yourself and pressing 1 is a deliberate press, and a guard
// there would be the app second-guessing you. Every other key stays live.

/**
 * How long a number is inert for. A keystroke already on its way when the
 * screen changed arrives within a couple of hundred milliseconds of it; this is
 * several times that and still short enough that a press you make after reading
 * the new thread is never refused (the strip takes longer than this to read).
 */
export const PICK_SETTLES_MS = 800;

/** Where the pointer stood, in screen pixels. */
export type Point = { x: number; y: number };

/** The thread the app last moved you to, when, and where the pointer stood
 *  then. `from` goes back to null once a click has been refused for it. */
export type Arrival = { key: string; at: number; from?: Point | null } | null;

/**
 * Whether a number pressed now is aimed at the thread on screen. `here` and
 * `arrival.key` are the window's own key for a thread (`keyOf` in App.tsx,
 * which names the project too: two projects can hold the same id).
 */
export function pickLandsHere(arrival: Arrival, here: string, now: number): boolean {
  if (!arrival || arrival.key !== here) return true;
  return now - arrival.at >= PICK_SETTLES_MS;
}

/**
 * What is said when one is refused. It says which thread the press was for,
 * because the whole fault is not knowing that, and it says the way to answer
 * this one, because the key works again a moment later.
 */
export const AIMED_AT_THE_THREAD_YOU_LEFT =
  'That number was for the thread you just left. Press it again to answer this one.';

// AND A CLICK IS AIMED THE SAME WAY, at a place rather than at a thread.
//
// The strip stands at the foot of a turn in the scrolling pane, so a line
// arriving above it while a run writes carries every row down the window: the
// pointer put on row 2 is over row 1 by the time the button goes down, and
// that press sends. So an option that jumped under the pointer does not take
// the next click. The refusal needs the pointer to have been ON the strip when
// it moved, so a click you walk over to after the move is never refused.

/** How far the strip has to jump to count as having moved. Layout settles by
 *  fractions of a pixel; this is a row's worth of nothing. */
export const MOVED_PX = 4;

/** Whether a click now lands on the row you were looking at. `movedAt` is when
 *  the strip last jumped under the pointer, or null if it has not. */
export function clickLandsOnTheRowYouSaw(movedAt: number | null, now: number): boolean {
  if (movedAt === null) return true;
  return now - movedAt >= PICK_SETTLES_MS;
}

/** Said when one is refused, and it is true: the next click goes through. */
export const THE_OPTIONS_MOVED =
  'The options moved under your pointer. Click the one you want again.';

// A CLICK ON A THREAD THE APP JUST OPENED WANTS THE POINTER TO HAVE MOVED.
// After a pick or a reply the next thread is drawn where the pointer already
// stands, often with "Commit it and ship" under it (F-174). A key is guarded
// for a moment; a second click meant for the card you left can come later than
// that, and nothing about it is aimed at the new thread. So until the pointer
// moves, the first click is refused and says so, and the one after it goes.

/** How long after the app opened a thread a still pointer is suspect. */
export const STILL_POINTER_MS = 10_000;

/** Whether a click on this thread's options is aimed at it. `pointer` is
 *  where the pointer stands now, null when it has never moved. */
export function clickAimedHere(arrival: Arrival, here: string, now: number, pointer: Point | null): boolean {
  if (!pickLandsHere(arrival, here, now)) return false;
  if (!arrival || arrival.key !== here || !arrival.from || !pointer) return true;
  if (now - arrival.at >= STILL_POINTER_MS) return true;
  return Math.hypot(pointer.x - arrival.from.x, pointer.y - arrival.from.y) > MOVED_PX;
}

export const CLICK_FOR_THE_THREAD_YOU_LEFT =
  'That click was for the thread you just left. Click again to answer this one.';
